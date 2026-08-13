/**
 * Semester initialisation — the five-step HOD wizard.
 * Roster spreadsheets are parsed and turned into Supabase Auth accounts by
 * the serverless import endpoint (service role); the browser never holds a
 * privileged key.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { TextField, SelectField, FileField } from '../../components/ui/FormControls.jsx';
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

  const [batches, setBatches] = useState([]);
  const [activeCycle, setActiveCycle] = useState(null);
  const [newCycle, setNewCycle] = useState({ academic_year: '', term: 'Odd' });
  const [importType, setImportType] = useState('faculty');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  /**
   * THE STEPPER IS A LIVE INDICATOR FOR THE IMPORT HAPPENING RIGHT NOW —
   * not a permanent record of the semester's state.
   *
   * It used to read current_step off the semester row, which meant that
   * after the very first successful upload every tick stayed green
   * forever: the next import gave no feedback at all, because the steps
   * were already "done". Now it starts empty (grey), fills in as the
   * import actually progresses, and clears itself a couple of seconds
   * after it finishes, ready for the next one.
   *
   * `doneSteps` is a Set rather than a high-water number because step 2
   * (faculty) and step 3 (students) are alternatives: a faculty-only
   * import must not light up "Upload students".
   */
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const [busyStep, setBusyStep] = useState(null);
  const resetTimer = useRef(null);

  const markStep = (...numbers) =>
    setDoneSteps((current) => {
      const next = new Set(current);
      for (const number of numbers) next.add(number);
      return next;
    });

  const resetStepper = () => {
    setDoneSteps(new Set());
    setBusyStep(null);
  };

  // A pending reset must not fire after the component is gone, or after a
  // second import has already started.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const load = useCallback(async () => {
    const [{ data: cycleRows }, { data: batchRows }] = await Promise.all([
      supabase.from('semester_cycles').select('*').order('created_at', { ascending: false }),
      supabase.from('roster_import_batches').select('*').order('created_at', { ascending: false }).limit(20)
    ]);
    setBatches(batchRows ?? []);
    // Always the most recently created semester — there is no picker now.
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
          await load();
        }
      }
    );
  };

  const upload = () => {
    // Cancel any pending "fade back to grey" from the previous import, or
    // it would wipe the ticks halfway through this one.
    clearTimeout(resetTimer.current);
    setDoneSteps(new Set([1]));   // the semester exists — step 1 is done
    setBusyStep(2);

    return run(
      async () => {
        if (!file) throw new Error('Choose a .csv or .xlsx file first.');

        const base64 = await fileToBase64(file);
        // File is read and on its way. Tick whichever roster step this
        // import actually is — a combined file covers both.
        const ROSTER_STEPS = { faculty: [2], student: [3], combined: [2, 3] };
        markStep(...ROSTER_STEPS[importType]);
        setBusyStep(4);

        const data = await apiClient.post('/admin/import-roster-spreadsheet', {
          import_type: importType,
          filename: file.name,
          file_base64: base64,
          semester_cycle_id: activeCycle?.id ?? null,
          create_accounts: true
        });

        // Validation came back — the remaining work is account creation,
        // which the endpoint has already finished by the time it responds.
        markStep(4);
        setBusyStep(5);
        return data;
      },
      {
        onSuccess: async (data) => {
          markStep(5);
          setBusyStep(null);
          setResult(data);
          toast.success(`${data.created.length} account(s) created.`);
          setFile(null);
          await load();
          // Back to grey, ready for the next upload.
          resetTimer.current = setTimeout(resetStepper, 2500);
        },
        onError: resetStepper
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
    link.download = `smp-${importType}-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  // Show the "finish" panel once something has actually been imported for
  // this semester. Previously keyed off the stepper, which is now transient.
  const hasImports =
    (activeCycle?.faculty_imported_count ?? 0) > 0 || (activeCycle?.student_imported_count ?? 0) > 0;

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
            const done = doneSteps.has(step.number);
            const busy = busyStep === step.number;
            return (
              <li key={step.number} className="flex flex-1 items-center gap-2 min-w-[140px]">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-sm transition-colors ${
                    done ? 'bg-success text-white' : busy ? 'bg-primary text-white' : 'bg-surface-container-high text-tertiary'
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
                <span className={`text-label-sm ${busy ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {step.label}
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

          {/* The "Working on" picker was removed. Imports now always attach
              to the most recently created semester, which load() puts at the
              head of the list — the only case where choosing mattered was
              back-filling an old semester, which nobody was doing. */}
        </Panel>

        <Panel tab="2–4 · Import roster" tabIcon="upload_file" className="lg:col-span-2">
          <div className="space-y-4">
            <SelectField
              label="What are you importing?"
              value={importType}
              onChange={(event) => setImportType(event.target.value)}
              options={[
                { value: 'faculty', label: 'Faculty roster' },
                { value: 'student', label: 'Student roster' },
                { value: 'combined', label: 'Both together (one file with faculty and students)' }
              ]}
              hint={
                importType === 'student'
                  ? 'Import the faculty roster first so the "Mentor Email" column can be matched.'
                  : importType === 'combined'
                    ? 'The file needs a "Role" column saying Faculty or Student on every row. Faculty are created first, so "Mentor Email" resolves even for colleagues in the same file.'
                    : undefined
              }
            />

            {/* No column-headings crib sheet and no dry-run checkbox. The
                parser already accepts every common spelling of each column
                and reports unusable rows back individually, so the import
                is its own validation — a separate "validate only" pass was
                an extra click that told the HOD what the real run tells
                them anyway. */}
            <FileField
              label="Roster file"
              accept=".csv,.xlsx"
              placeholder="Choose a file (CSV or XLSX)"
              currentName={file?.name}
              onFileSelected={setFile}
              disabled={pending}
            />

            <button type="button" className="btn-primary" onClick={upload} disabled={pending || !file}>
              <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
              {pending ? 'Processing...' : 'Import and create accounts'}
            </button>
          </div>
        </Panel>
      </div>

      {activeCycle && !activeCycle.is_initialized && hasImports && (
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
        title="Import complete"
        description="Download the credentials file and distribute it securely. Passwords are shown only once."
        footer={
          <>
            {result?.created?.length > 0 && (
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
            <p className="text-label-sm text-on-success-container">Created</p>
            <p className="text-headline-sm text-on-success-container">{result?.created?.length ?? 0}</p>
            {(result?.faculty_created > 0 || result?.student_created > 0) && (
              <p className="text-label-sm text-on-success-container">
                {result.faculty_created} faculty · {result.student_created} students
              </p>
            )}
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

        {result?.created?.length > 0 && (
          <p className="mt-4 rounded bg-warning-container/60 px-3 py-2 text-body-sm text-on-warning-container">
            Temporary passwords are shown only in this download. Every account is forced to set a new password
            on first sign-in.
          </p>
        )}
      </Modal>
    </PortalShell>
  );
}
