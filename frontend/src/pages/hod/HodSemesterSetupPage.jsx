/**
 * Semester initialisation.
 *
 * Roster upload moved to the Cluster Head portal, so this page is now
 * what its name says: create the semester, watch what gets imported
 * against it, and close it off. The five-step stepper went with the
 * upload — it existed to narrate an import that no longer happens here,
 * and a stepper that never moves is worse than no stepper.
 *
 * The import history stays: the HOD still needs to see what was loaded
 * and what failed, they just are not the one loading it.
 */

import { useCallback, useEffect, useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { TextField, SelectField } from '../../components/ui/FormControls.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { formatDateTime } from '../../lib/formatters.js';

export default function HodSemesterSetupPage() {
  const toast = useToast();
  const { run, pending } = useAsyncAction();

  const [batches, setBatches] = useState([]);
  const [activeCycle, setActiveCycle] = useState(null);
  const [newCycle, setNewCycle] = useState({ academic_year: '', term: 'Odd' });

  const load = useCallback(async () => {
    const [{ data: cycleRows }, { data: batchRows }] = await Promise.all([
      supabase.from('semester_cycles').select('*').order('created_at', { ascending: false }),
      supabase.from('roster_import_batches').select('*').order('created_at', { ascending: false }).limit(20)
    ]);
    setBatches(batchRows ?? []);
    // Always the most recently created semester — imports attach to it.
    setActiveCycle(cycleRows?.[0] ?? null);
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
        const { error } = await supabase
          .from('semester_cycles')
          .insert({ academic_year: newCycle.academic_year, term: newCycle.term, current_step: 2 })
          .select()
          .single();
        if (error) throw error;
      },
      {
        successMessage: 'Semester created. The Cluster Head can now import the rosters.',
        onSuccess: async () => {
          setNewCycle({ academic_year: '', term: 'Odd' });
          await load();
        }
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

  const hasImports =
    (activeCycle?.faculty_imported_count ?? 0) > 0 || (activeCycle?.student_imported_count ?? 0) > 0;

  return (
    <PortalShell>
      <PageHeader
        title="Semester setup"
        subtitle="Create the semester, then track what the Cluster Head imports against it."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel tab="New semester" tabIcon="event">
          <form onSubmit={createCycle} className="space-y-4">
            <TextField
              label="Academic year"
              name="academic_year"
              required
              placeholder="2026-27"
              value={newCycle.academic_year}
              onChange={(event) => setNewCycle((c) => ({ ...c, academic_year: event.target.value }))}
              hint="Format: YYYY-YY"
            />
            <SelectField
              label="Term"
              name="term"
              required
              value={newCycle.term}
              onChange={(event) => setNewCycle((c) => ({ ...c, term: event.target.value }))}
              options={['Odd', 'Even']}
            />
            <button type="submit" className="btn-primary w-full" disabled={pending}>
              Create semester
            </button>
          </form>
        </Panel>

        <Panel tab="Roster import" tabIcon="upload_file" className="lg:col-span-2">
          <div className="flex flex-wrap items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-primary" aria-hidden="true">
              swap_horiz
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-label-md text-on-surface">
                Roster upload has moved to the Cluster Head portal
              </p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Student and faculty rosters, and the mentor&ndash;mentee mapping, are uploaded by the Cluster
                Head, who holds the departmental files. Imports still attach to the most recent semester and
                still show up in the history below, with every row that failed.
              </p>
              {activeCycle && (
                <p className="mt-3 text-label-sm text-tertiary">
                  Imports currently attach to <strong>{activeCycle.academic_year} {activeCycle.term}</strong>.
                </p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {activeCycle && !activeCycle.is_initialized && hasImports && (
        <Panel tab="Finish" tabIcon="done_all" className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-on-surface-variant">
              {activeCycle.faculty_imported_count} faculty and {activeCycle.student_imported_count} student
              accounts have been created for {activeCycle.academic_year} {activeCycle.term}.
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
          emptyState={
            <EmptyState
              icon="upload_file"
              title="No imports yet"
              description="The Cluster Head uploads the rosters from their own portal."
            />
          }
        />
      </Panel>
    </PortalShell>
  );
}
