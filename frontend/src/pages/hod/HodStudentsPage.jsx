import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { SkeletonTable } from '../../components/ui/Skeleton.jsx';
import { FilterPills } from '../../components/ui/FormControls.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import AddAccountModal from '../../components/hod/AddAccountModal.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { describeError } from '../../lib/formatters.js';

export default function HodStudentsPage() {
  const toast = useToast();
  const { run, pending } = useAsyncAction();
  const [students, setStudents] = useState([]);
  const [mentorNames, setMentorNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rows, error }, { data: faculty }] = await Promise.all([
      supabase.from('student_ticket_summary').select('*').order('student_name'),
      supabase.from('user_profiles').select('id, full_name').eq('role', 'faculty')
    ]);
    if (error) toast.error(describeError(error));
    setStudents(rows ?? []);
    setMentorNames(Object.fromEntries((faculty ?? []).map((f) => [f.id, f.full_name])));
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const unlockFormA = () =>
    run(
      async () => {
        const { error } = await supabase.rpc('unlock_student_form_a', { p_student_id: unlockTarget.student_id });
        if (error) throw error;
      },
      {
        successMessage: 'Form A unlocked. The student can edit and resubmit it.',
        onSuccess: () => {
          setUnlockTarget(null);
          load();
        }
      }
    );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((student) => {
      if (filter === 'unassigned' && student.assigned_mentor_id) return false;
      if (filter === 'pending_form_a' && student.form_a_completed) return false;
      if (filter === 'with_open' && student.open_tickets + student.in_progress_tickets === 0) return false;
      if (!term) return true;
      return (
        student.student_name?.toLowerCase().includes(term) ||
        student.registration_no?.toLowerCase().includes(term) ||
        student.email?.toLowerCase().includes(term)
      );
    });
  }, [students, search, filter]);

  const summary = useMemo(
    () => ({
      total: students.length,
      unassigned: students.filter((s) => !s.assigned_mentor_id).length,
      pendingForm: students.filter((s) => !s.form_a_completed).length,
      withOpen: students.filter((s) => s.open_tickets + s.in_progress_tickets > 0).length
    }),
    [students]
  );

  return (
    <PortalShell searchPlaceholder="Search students by name, registration number or email..." onSearch={setSearch}>
      <PageHeader
        title="Students"
        subtitle="Every student in the department, their mentor and their onboarding status."
        actions={
          <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Add account
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total students" value={summary.total} icon="school" tone="primary" />
        <StatCard label="Without a mentor" value={summary.unassigned} icon="person_off"
          tone={summary.unassigned ? 'error' : 'success'} />
        <StatCard label="Form A pending" value={summary.pendingForm} icon="assignment_late"
          tone={summary.pendingForm ? 'warning' : 'success'} />
        <StatCard label="With active tickets" value={summary.withOpen} icon="pending_actions" tone="info" />
      </div>

      <Panel tab="Filters" tabIcon="filter_alt" className="mb-4">
        <FilterPills
          ariaLabel="Filter students"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: students.length },
            { value: 'unassigned', label: 'No mentor', count: summary.unassigned },
            { value: 'pending_form_a', label: 'Form A pending', count: summary.pendingForm },
            { value: 'with_open', label: 'Active tickets', count: summary.withOpen }
          ]}
        />
      </Panel>

      {loading ? (
        <SkeletonTable rows={10} columns={8} />
      ) : (
        <Panel bodyClassName="">
          <DataTable
            columns={[
              {
                key: 'student_name',
                header: 'Student',
                render: (row) => (
                  <Link to={`/hod/students/${row.student_id}`} className="text-on-surface hover:text-primary hover:underline">
                    <span className="block">{row.student_name}</span>
                    <span className="text-label-sm text-tertiary">{row.email}</span>
                  </Link>
                )
              },
              { key: 'registration_no', header: 'Reg. no.' },
              { key: 'branch', header: 'Branch' },
              { key: 'section', header: 'Sec' },
              {
                key: 'assigned_mentor_id',
                header: 'Mentor',
                render: (row) =>
                  row.assigned_mentor_id ? (
                    mentorNames[row.assigned_mentor_id] ?? '—'
                  ) : (
                    <span className="chip bg-error-container text-on-error-container">Unassigned</span>
                  )
              },
              {
                key: 'form_a_completed',
                header: 'Form A',
                render: (row) =>
                  row.form_a_completed ? (
                    <span className="chip bg-success-container text-on-success-container">Submitted</span>
                  ) : (
                    <span className="chip bg-warning-container text-on-warning-container">Pending</span>
                  )
              },
              { key: 'total_tickets', header: 'Tickets', align: 'right' },
              {
                key: 'actions',
                header: '',
                render: (row) =>
                  row.form_a_completed ? (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setUnlockTarget(row)}>
                      <span className="material-symbols-outlined text-[16px]">lock_open</span>
                      Unlock Form A
                    </button>
                  ) : null
              }
            ]}
            rows={filtered}
            rowKey={(row) => row.student_id}
            emptyState={<EmptyState icon="school" title="No students found" description="Try clearing the filters." />}
          />
        </Panel>
      )}

      <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />

      <ConfirmDialog
        open={Boolean(unlockTarget)}
        onClose={() => setUnlockTarget(null)}
        onConfirm={unlockFormA}
        pending={pending}
        title="Unlock Form A?"
        confirmLabel="Unlock"
        message={`${unlockTarget?.student_name} will be able to edit and resubmit their Form A. They will be redirected to it on their next sign-in.`}
      />
    </PortalShell>
  );
}
