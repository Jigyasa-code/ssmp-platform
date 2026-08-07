/**
 * Semester initialisation — the five-step HOD wizard.
 * Roster spreadsheets are parsed and turned into Supabase Auth accounts by
 * the serverless import endpoint (service role); the browser never holds a
 * privileged key.
 */

import { useCallback, useEffect, useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { TextField, SelectField, FileField, CheckboxField } from '../../components/ui/FormControls.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { apiClient } from '../../lib/apiClient.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { formatDateTime } from '../../lib/formatters.js';

const STEPS = [
  { number: 1, label: 'New semester', icon: 'event' },
  { number: 2, label: 'Upload faculty', icon: 'badge' },
  { number: 3, label: 'Upload students', icon: 'school' },
  { number: 4, label: 'Validate', icon: 'fact_check' },
  { number: 5, label: 'Accounts created', icon: 'done_all' }
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function HodSemesterSetupPage() {
  const toast = useToast();
  const { run, pending } = useAsyncAction();

  const [cycles, setCycles] = useState([]);
  const [batches, setBatches] = useState([]);
  const [activeCycle, setActiveCycle] = useState(null);
  const [newCycle, setNewCycle] = useState({ academic_year: '', term: 'Odd' });
  const [importType, setImportType] = useState('faculty');
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState(null);
  /**
   * The server only bumps current_step once accounts have actually been
   * created, which left the stepper looking frozen for the several seconds
   * that takes. This advances the earlier steps the moment the HOD acts,
   * and leaves only step 5 -- "accounts created" -- waiting on the server.
   */
  const [optimisticStep, setOptimisticStep] = useState(0);

  const load = useCallback(async () => {
    const [{ data: cycleRows }, { data: batchRows }] = await Promise.all([
      supabase.from('semester_cycles').select('*').order('created_at', { ascending: false }),
      supabase.from('roster_import_batches').select('*').order('created_at', { ascending: false }).limit(20)
    ]);
    setCycles(cycleRows ?? []);
    setBatches(batchRows ?? []);
    setActiveCycle((current) => current ?? cycleRows?.[0] ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createCycle = (event) => {
    event.preventDefault();
    if (!/^[0-9]{4}-[0-9]{2}$/.test(newCycle.academic_year)) {
      toast.error('Academic year must look like 2026-27.');
      return;
    }
    run(
      async () => {
        const { data, error } = await supabase
          .from('semester_cycles')
          .insert({ academic_year: newCycle.academic_year, term: newCycle.term, current_step: 2 })
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      {
        successMessage: 'Semester created. Next, upload the faculty roster.',
        onSuccess: async (created) => {
          setNewCycle({ academic_year: '', term: 'Odd' });
          setActiveCycle(created);
          setOptimisticStep(2);
          await load();
        }
      }
    );
  };

  const upload = () => {
    // Steps 2-4 are "the HOD has done their part" -- tick them now.
    setOptimisticStep(importType === 'faculty' ? 3 : 4);
    return run(
      async () => {
        if (!file) throw new Error('Choose a .csv or .xlsx file first.');
        const base64 = await fileToBase64(file);
        return apiClient.post('/admin/import-roster-spreadsheet', {
          import_type: importType,
          filename: file.name,
          file_base64: base64,
          semester_cycle_id: activeCycle?.id ?? null,
          create_accounts: !dryRun
        });
      },
      {
        onSuccess: async (data) => {
          setResult({ ...data, dryRun });
          // Step 5 only ticks once accounts really exist.
          if (!dryRun && data.created.length) setOptimisticStep(5);
          toast.success(
            dryRun
              ? `Validation complete: ${data.created.length} ready, ${data.failed.length} with problems.`
              : `${data.created.length} account(s) created.`
          );
          setFile(null);
          await load();
        },
        onError: () => setOptimisticStep(0)
      }
    );
  };

  const finalize = () =>
    run(
      async () => {
        const { error } = await supabase
          .from('semester_cycles')
          .update({ is_initialized: true, current_step: 5, initialized_at: new Date().toISOString() })
          .eq('id', activeCycle.id);
        if (error) throw error;
      },
      { successMessage: 'Semester marked as initialised.', onSuccess: load }
    );

  const downloadCredentials = () => {
    if (!result?.created?.length) return;
    const header = 'Name,Email,Login ID,Temporary Password\n';
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const body = result.created
      .map((row) => [row.full_name, row.email, row.login_id, row.temporary_password].map(escape).join(','))
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ssmp-${importType}-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  // Whichever is further along wins: the server's record, or what the HOD
  // has already done in this session.
  const currentStep = Math.max(activeCycle?.current_step ?? 1, optimisticStep);
  const awaitingAccounts = pending && !dryRun;

  return (
    <PortalShell>
      <PageHeader
        title="Semester setup"
        subtitle="Create the semester, import the faculty and student rosters, then hand out credentials."
      />

      {/* Stepper */}
      <Panel tab="Progress" tabIcon="linear_scale" className="mb-4">
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((step, index) => {
            const done = currentStep > step.number || activeCycle?.is_initialized;
            const active = currentStep === step.number && !activeCycle?.is_initialized;
            const busy = awaitingAccounts && step.number === 5;
            return (
              <li key={step.number} className="flex flex-1 items-center gap-2 min-w-[140px]">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-sm transition-colors ${
                    done ? 'bg-success text-white' : active || busy ? 'bg-primary text-white' : 'bg-surface-container-high text-tertiary'
                  }`}
                >
                  {busy ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : done ? (
                    <span className="material-symbols-outlined text-[17px]">check</span>
                  ) : (
                    step.number
                  )}
                </span>
                <span className={`text-label-sm ${active || busy ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {busy ? 'Creating accounts...' : step.label}
                </span>
                {index < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-outline-variant sm:block" />}
              </li>
            );
          })}
        </ol>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel tab="1 · New semester" tabIcon="event">
          <form onSubmit={createCycle} className="space-y-4">
            <TextField
              label="Academic year"
              required
              placeholder="2026-27"
              value={newCycle.academic_year}
              onChange={(event) => setNewCycle((c) => ({ ...c, academic_year: event.target.value }))}
              hint="Format: YYYY-YY"
            />
            <SelectField
              label="Term"
              required
              value={newCycle.term}
              onChange={(event) => setNewCycle((c) => ({ ...c, term: event.target.value }))}
              options={['Odd', 'Even']}
            />
            <button type="submit" className="btn-primary w-full" disabled={pending}>
              Create semester
            </button>
          </form>

          {cycles.length > 0 && (
            <div className="mt-5 border-t border-surface-container pt-4">
              <label htmlFor="active-cycle" className="field-label">
                Working on
              </label>
              <select
                id="active-cycle"
                className="field-input"
                value={activeCycle?.id ?? ''}
                onChange={(event) => setActiveCycle(cycles.find((c) => c.id === event.target.value) ?? null)}
              >
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.academic_year} · {cycle.term}
                    {cycle.is_initialized ? ' (initialised)' : ''}
                  </option>
                ))}
              </select>
              {activeCycle && (
                <dl className="mt-3 space-y-1.5 text-label-sm">
                  <div className="flex justify-between">
                    <dt className="text-tertiary">Faculty imported</dt>
                    <dd className="text-on-surface">{activeCycle.faculty_imported_count}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-tertiary">Students imported</dt>
                    <dd className="text-on-surface">{activeCycle.student_imported_count}</dd>
                  </div>
                </dl>
              )}
            </div>
          )}
        </Panel>

        <Panel tab="2–4 · Import roster" tabIcon="upload_file" className="lg:col-span-2">
          <div className="space-y-4">
            <SelectField
              label="What are you importing?"
              value={importType}
              onChange={(event) => setImportType(event.target.value)}
              options={[
                { value: 'faculty', label: 'Faculty roster' },
                { value: 'student', label: 'Student roster' }
              ]}
              hint={
                importType === 'student'
                  ? 'Import the faculty roster first so the "Mentor Email" column can be matched.'
                  : undefined
              }
            />

            <FileField
              label="Roster file"
              accept=".csv,.xlsx"
              hint="CSV or XLSX. Columns: Email, Name (required); Reg No / Faculty ID, Branch, Section, Semester, Phone, Mentor Email (optional)."
              currentName={file?.name}
              onFileSelected={setFile}
              disabled={pending}
            />

            <CheckboxField
              label="Validate only (dry run)"
              description="Check the file for problems without creating any accounts. Recommended before the real import."
              checked={dryRun}
              onChange={setDryRun}
            />

            <button type="button" className="btn-primary" onClick={upload} disabled={pending || !file}>
              <span className="material-symbols-outlined text-[18px]">{dryRun ? 'fact_check' : 'cloud_upload'}</span>
              {pending ? 'Processing...' : dryRun ? 'Validate file' : 'Import and create accounts'}
            </button>

            <div className="rounded border border-dashed border-outline-variant bg-surface-container-low p-3 text-label-sm text-on-surface-variant">
              <p className="font-semibold">Accepted column headings (any of these spellings)</p>
              <p className="mt-1">
                Email · Name / Full Name / Student Name · Reg No / Registration No / Roll No / Faculty ID ·
                Branch / Dept · Section · Semester · Mobile / Phone · Mentor Email / Faculty Email
              </p>
            </div>
          </div>
        </Panel>
      </div>

      {activeCycle && !activeCycle.is_initialized && currentStep >= 4 && (
        <Panel tab="5 · Finish" tabIcon="done_all" className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-on-surface-variant">
              {activeCycle.faculty_imported_count} faculty and {activeCycle.student_imported_count} student accounts
              have been created for {activeCycle.academic_year} {activeCycle.term}.
            </p>
            <button type="button" className="btn-primary" onClick={finalize} disabled={pending}>
              Mark semester as initialised
            </button>
          </div>
        </Panel>
      )}

      <Panel tab="Import history" tabIcon="history" className="mt-4" bodyClassName="">
        <DataTable
          dense
          columns={[
            { key: 'created_at', header: 'When', render: (row) => formatDateTime(row.created_at) },
            { key: 'import_type', header: 'Type' },
            { key: 'original_filename', header: 'File' },
            { key: 'total_rows', header: 'Rows', align: 'right' },
            { key: 'created_count', header: 'Created', align: 'right' },
            { key: 'skipped_count', header: 'Skipped', align: 'right' },
            {
              key: 'failed_count',
              header: 'Failed',
              align: 'right',
              render: (row) => (
                <span className={row.failed_count > 0 ? 'text-error' : ''}>{row.failed_count}</span>
              )
            }
          ]}
          rows={batches}
          rowKey={(row) => row.id}
          emptyState={<EmptyState icon="upload_file" title="No imports yet" description="Upload a roster to get started." />}
        />
      </Panel>

      {/* Result modal */}
      <Modal
        open={Boolean(result)}
        onClose={() => setResult(null)}
        size="lg"
        title={result?.dryRun ? 'Validation results' : 'Import complete'}
        description={
          result?.dryRun
            ? 'Nothing has been created yet. Untick "Validate only" and run again to create the accounts.'
            : 'Download the credentials file and distribute it securely. Passwords are shown only once.'
        }
        footer={
          <>
            {!result?.dryRun && result?.created?.length > 0 && (
              <button type="button" className="btn-secondary" onClick={downloadCredentials}>
                <span className="material-symbols-outlined text-[18px]">download</span>
                Download credentials (CSV)
              </button>
            )}
            <button type="button" className="btn-primary" onClick={() => setResult(null)}>
              Done
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded bg-success-container/60 p-3">
            <p className="text-label-sm text-on-success-container">{result?.dryRun ? 'Ready to import' : 'Created'}</p>
            <p className="text-headline-sm text-on-success-container">{result?.created?.length ?? 0}</p>
          </div>
          <div className="rounded bg-surface-container p-3">
            <p className="text-label-sm text-on-surface-variant">Already existed</p>
            <p className="text-headline-sm text-on-surface">{result?.skipped?.length ?? 0}</p>
          </div>
          <div className="rounded bg-error-container/60 p-3">
            <p className="text-label-sm text-on-error-container">Problems</p>
            <p className="text-headline-sm text-on-error-container">{result?.failed?.length ?? 0}</p>
          </div>
        </div>

        {result?.failed?.length > 0 && (
          <div className="mt-4">
            <h3 className="text-label-md text-on-surface">Rows that need fixing</h3>
            <ul className="custom-scrollbar mt-2 max-h-56 space-y-1 overflow-y-auto rounded border border-topbar-border p-2">
              {result.failed.map((failure, index) => (
                <li key={`${failure.row}-${index}`} className="text-label-sm text-on-surface-variant">
                  <span className="font-semibold text-error">Row {failure.row}</span> {failure.email} — {failure.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!result?.dryRun && result?.created?.length > 0 && (
          <p className="mt-4 rounded bg-warning-container/60 px-3 py-2 text-body-sm text-on-warning-container">
            Temporary passwords are shown only in this download. Every account is forced to set a new password
            on first sign-in.
          </p>
        )}
      </Modal>
    </PortalShell>
  );
}
