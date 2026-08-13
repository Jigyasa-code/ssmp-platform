/**
 * Mentee roster with FEATURE 7 — star mentee (student representative).
 * Exactly one star per mentor group; starring a new student automatically
 * un-stars the previous one, confirmed first via a dialog.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { SkeletonTable } from '../../components/ui/Skeleton.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { apiClient } from '../../lib/apiClient.js';
import { describeError, formatDate } from '../../lib/formatters.js';

export default function FacultyMenteesPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { run, pending } = useAsyncAction();

  const [mentees, setMentees] = useState([]);
  const [surveyStatus, setSurveyStatus] = useState({ cycle: null, byStudent: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [starTarget, setStarTarget] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);

    // Two independent reads, so they go in parallel: the ticket rollup the
    // page has always shown, plus completion status for the survey cycle
    // that is currently open (the mentor-facing half of the 15-day pulse
    // check — the student rep sees the same numbers from their side).
    const [summaryResult, surveyResult] = await Promise.all([
      supabase
        .from('student_ticket_summary')
        .select('*')
        .eq('assigned_mentor_id', profile.id)
        .order('student_name'),
      supabase
        .from('survey_mentee_status')
        .select('cycle_number, closes_on, student_id, has_submitted, submitted_at')
        .eq('assigned_mentor_id', profile.id)
        .eq('cycle_is_active', true)
    ]);

    if (summaryResult.error) toast.error(describeError(summaryResult.error));
    if (surveyResult.error) toast.error(describeError(surveyResult.error));

    setMentees(summaryResult.data ?? []);
    setSurveyStatus({
      cycle: surveyResult.data?.[0] ?? null,
      byStudent: Object.fromEntries((surveyResult.data ?? []).map((row) => [row.student_id, row]))
    });
    setLoading(false);
  }, [profile.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const currentStar = mentees.find((m) => m.is_star_mentee);

  const toggleStar = () =>
    run(
      async () => {
        const { error } = await supabase.rpc('set_star_mentee', {
          p_student_id: starTarget.student_id,
          p_is_star: !starTarget.is_star_mentee
        });
        if (error) throw error;
      },
      {
        successMessage: starTarget.is_star_mentee
          ? `${starTarget.student_name} is no longer the student representative.`
          : `${starTarget.student_name} is now your student representative.`,
        onSuccess: () => {
          setStarTarget(null);
          load();
        }
      }
    );

  const downloadReport = async (mentee) => {
    setDownloading(mentee.student_id);
    try {
      await apiClient.downloadFile(
        '/reports/student-dossier-report',
        { student_id: mentee.student_id, format: 'pdf' },
        `student-report-${mentee.student_id}.pdf`
      );
      toast.success('Report downloaded.');
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setDownloading(null);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mentees;
    return mentees.filter(
      (m) =>
        m.student_name?.toLowerCase().includes(term) ||
        m.registration_no?.toLowerCase().includes(term) ||
        m.email?.toLowerCase().includes(term)
    );
  }, [mentees, search]);

  const columns = [
    {
      key: 'star',
      header: 'Rep',
      render: (row) => (
        <button
          type="button"
          onClick={() => setStarTarget(row)}
          disabled={pending}
          aria-label={row.is_star_mentee ? `Remove ${row.student_name} as representative` : `Make ${row.student_name} the representative`}
          className="p-1 text-warning transition-transform hover:scale-110 disabled:opacity-50"
        >
          <span
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: row.is_star_mentee ? "'FILL' 1" : "'FILL' 0" }}
          >
            star
          </span>
        </button>
      )
    },
    {
      key: 'student_name',
      header: 'Student',
      render: (row) => (
        <Link to={`/faculty/mentees/${row.student_id}`} className="text-on-surface hover:text-primary hover:underline">
          <span className="block">{row.student_name}</span>
          <span className="text-label-sm text-tertiary">{row.email}</span>
        </Link>
      )
    },
    { key: 'registration_no', header: 'Reg. no.' },
    { key: 'section', header: 'Section' },
    { key: 'branch', header: 'Branch' },
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
    {
      key: 'survey',
      header: 'Survey',
      render: (row) => {
        if (!surveyStatus.cycle) return <span className="text-tertiary">—</span>;
        return surveyStatus.byStudent[row.student_id]?.has_submitted ? (
          <span className="chip bg-success-container text-on-success-container">Filled in</span>
        ) : (
          <span className="chip bg-warning-container text-on-warning-container">Pending</span>
        );
      }
    },
    { key: 'total_tickets', header: 'Tickets', align: 'right' },
    {
      key: 'open',
      header: 'Open',
      align: 'right',
      render: (row) => (row.open_tickets + row.in_progress_tickets) || '—'
    },
    {
      key: 'actions',
      header: 'Report',
      render: (row) => (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => downloadReport(row)}
          disabled={downloading === row.student_id}
        >
          <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
          {downloading === row.student_id ? 'Building...' : 'PDF'}
        </button>
      )
    }
  ];

  return (
    <PortalShell searchPlaceholder="Search mentees by name or registration number..." onSearch={setSearch}>
      <PageHeader
        title="My mentees"
        subtitle="Your assigned mentor group. Star one student as your group representative."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total mentees" value={mentees.length} icon="groups" tone="primary" />
        <StatCard
          label="Form A submitted"
          value={mentees.filter((m) => m.form_a_completed).length}
          icon="assignment_turned_in"
          tone="success"
          caption={`${mentees.filter((m) => !m.form_a_completed).length} pending`}
        />
        <StatCard
          label="With open tickets"
          value={mentees.filter((m) => m.open_tickets + m.in_progress_tickets > 0).length}
          icon="pending_actions"
          tone="warning"
        />
        <StatCard
          label={surveyStatus.cycle ? `Survey #${surveyStatus.cycle.cycle_number} filled in` : 'Survey completion'}
          value={
            surveyStatus.cycle
              ? `${Object.values(surveyStatus.byStudent).filter((s) => s.has_submitted).length}/${mentees.length}`
              : 'No survey open'
          }
          icon="ballot"
          tone="warning"
          caption={
            surveyStatus.cycle
              ? `Closes ${formatDate(surveyStatus.cycle.closes_on)}`
              : 'Opens on the next 15-day cycle'
          }
        />
        <StatCard
          label="Representative"
          value={currentStar ? currentStar.student_name.split(' ')[0] : 'Not set'}
          icon="workspace_premium"
          tone="info"
          caption={currentStar ? currentStar.registration_no : 'Star a student below'}
        />
      </div>

      {loading ? (
        <SkeletonTable rows={8} columns={9} />
      ) : (
        <Panel bodyClassName="">
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.student_id}
            emptyState={
              <EmptyState
                icon="groups"
                title={mentees.length ? 'No mentees match your search' : 'No mentees assigned yet'}
                description={
                  mentees.length
                    ? 'Try a different name or registration number.'
                    : 'The HOD assigns mentees when the semester roster is uploaded.'
                }
              />
            }
          />
        </Panel>
      )}

      <ConfirmDialog
        open={Boolean(starTarget)}
        onClose={() => setStarTarget(null)}
        onConfirm={toggleStar}
        pending={pending}
        title={starTarget?.is_star_mentee ? 'Remove student representative?' : 'Set student representative?'}
        confirmLabel={starTarget?.is_star_mentee ? 'Remove' : 'Confirm'}
        message={
          starTarget?.is_star_mentee
            ? `${starTarget?.student_name} will no longer be marked as your group representative.`
            : currentStar && currentStar.student_id !== starTarget?.student_id
              ? `This will replace the current representative, ${currentStar.student_name}, with ${starTarget?.student_name}. Continue?`
              : `${starTarget?.student_name} will be marked as the representative for your mentor group.`
        }
      />
    </PortalShell>
  );
}
