/**
 * FacultyAtRiskPage
 * The at-risk roster, kept as its OWN section rather than mixed into My
 * Mentees — that separation is the whole point of the request: a mentor
 * should be able to see at a glance who is at risk and how to reach their
 * parents, without scanning a full mentee list for red flags.
 *
 * Every column a mentor needs to act is on the row: attendance, GPA,
 * backlog count, why they were flagged, and the parent contact number.
 * Clicking the student's name opens their existing full profile page —
 * the same FacultyMenteeDetailPage the mentee list links to, so there is
 * no second, divergent student view.
 *
 * Mounted twice (§ "Reuse pattern"): /faculty/at-risk and, with isHodView,
 * /hod/at-risk. Change one, check both.
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
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { describeError, formatDateTime } from '../../lib/formatters.js';
import { AT_RISK_MEETING_STATUS_LABELS } from '../../lib/constants.js';

function ReasonChips({ row }) {
  const chips = [
    row.low_attendance && { label: 'Attendance', tone: 'bg-error-container text-on-error-container' },
    row.low_gpa && { label: 'GPA', tone: 'bg-warning-container text-on-warning-container' },
    row.has_backlog && { label: 'Backlog', tone: 'bg-info-container text-on-info-container' }
  ].filter(Boolean);

  if (!chips.length) return <span className="text-tertiary">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span key={chip.label} className={`chip ${chip.tone}`}>
          {chip.label}
        </span>
      ))}
    </span>
  );
}

export default function FacultyAtRiskPage({ isHodView = false }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { run, pending } = useAsyncAction();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const basePath = isHodView ? '/hod/students' : '/faculty/mentees';

  const load = useCallback(async () => {
    setLoading(true);
    // RLS already scopes this view: a mentor sees their own mentees, the
    // HOD sees everyone. The explicit filter is a UX choice, not a
    // security one.
    let query = supabase
      .from('at_risk_student_overview')
      .select('*')
      .eq('is_at_risk', true)
      .order('attendance_percent', { nullsFirst: false });

    if (!isHodView) query = query.eq('assigned_mentor_id', profile.id);

    const { data, error } = await query;
    if (error) toast.error(describeError(error));
    setRows(data ?? []);
    setLoading(false);
  }, [isHodView, profile.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const markMeetingDone = (row) =>
    run(
      async () => {
        const { error } = await supabase.rpc('set_at_risk_meeting_status', {
          p_meeting_id: row.open_meeting_id,
          p_status: 'completed'
        });
        if (error) throw error;
      },
      { successMessage: `Meeting with ${row.student_name} marked as done.`, onSuccess: load }
    );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (row) =>
        row.student_name?.toLowerCase().includes(term) ||
        row.registration_no?.toLowerCase().includes(term) ||
        row.section?.toLowerCase().includes(term)
    );
  }, [rows, search]);

  const columns = [
    {
      key: 'student_name',
      header: 'Student',
      render: (row) => (
        <Link to={`${basePath}/${row.student_id}`} className="text-on-surface hover:text-primary hover:underline">
          <span className="block">{row.student_name}</span>
          <span className="text-label-sm text-tertiary">{row.registration_no ?? row.email}</span>
        </Link>
      )
    },
    { key: 'section', header: 'Section', align: 'center' },
    {
      key: 'attendance_percent',
      header: 'Attendance',
      align: 'right',
      render: (row) =>
        row.attendance_percent == null ? (
          <span className="text-tertiary">No data</span>
        ) : (
          <span className={row.low_attendance ? 'text-error' : 'text-on-surface'}>
            {Number(row.attendance_percent).toFixed(1)}%
          </span>
        )
    },
    {
      key: 'latest_gpa',
      header: 'GPA',
      align: 'right',
      render: (row) =>
        row.latest_gpa == null ? (
          <span className="text-tertiary">No data</span>
        ) : (
          <span className={row.low_gpa ? 'text-error' : 'text-on-surface'}>
            {Number(row.latest_gpa).toFixed(2)}
            {row.latest_gpa_semester ? (
              <span className="ml-1 text-label-sm text-tertiary">S{row.latest_gpa_semester}</span>
            ) : null}
          </span>
        )
    },
    {
      key: 'backlog_count',
      header: 'Backlogs',
      align: 'right',
      render: (row) =>
        row.backlog_count > 0 ? (
          <span className="text-error">{row.backlog_count}</span>
        ) : (
          <span className="text-tertiary">0</span>
        )
    },
    { key: 'reasons', header: 'Flagged for', render: (row) => <ReasonChips row={row} /> },
    {
      key: 'primary_parent_mobile',
      header: 'Parent contact',
      render: (row) => {
        if (!row.primary_parent_mobile) {
          return <span className="text-tertiary">Not on Form A</span>;
        }
        const name = row.father_mobile ? row.father_name : row.mother_name;
        return (
          <span className="break-anywhere">
            <a href={`tel:${row.primary_parent_mobile}`} className="text-primary hover:underline">
              {row.primary_parent_mobile}
            </a>
            {name && <span className="block text-label-sm text-tertiary">{name}</span>}
          </span>
        );
      }
    },
    ...(isHodView ? [{ key: 'mentor_name', header: 'Mentor' }] : []),
    {
      key: 'open_meeting_status',
      header: 'Meeting',
      render: (row) => {
        if (!row.open_meeting_id) {
          return <span className="text-tertiary">Not raised yet</span>;
        }
        return (
          <span>
            <span className="chip bg-warning-container text-on-warning-container">
              {AT_RISK_MEETING_STATUS_LABELS[row.open_meeting_status] ?? row.open_meeting_status}
            </span>
            <span className="mt-0.5 block text-label-sm text-tertiary">
              {formatDateTime(row.open_meeting_created_at)}
            </span>
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.open_meeting_id ? (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => markMeetingDone(row)}
            disabled={pending}
          >
            <span className="material-symbols-outlined text-[16px]">check</span>
            Mark done
          </button>
        ) : null
    }
  ];

  const withoutLink = rows.filter((row) => row.open_meeting_id && !row.open_meeting_join_url).length;

  return (
    <PortalShell searchPlaceholder="Search at-risk students..." onSearch={setSearch}>
      <PageHeader
        title="At-risk students"
        subtitle={
          isHodView
            ? 'Every student in the department currently flagged on attendance, GPA or backlogs, with parent contact details.'
            : 'Your mentees currently flagged on attendance, GPA or backlogs. Click a name to open their full profile.'
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Flagged students" value={rows.length} icon="e911_emergency" tone="error" />
        <StatCard
          label="Low attendance"
          value={rows.filter((row) => row.low_attendance).length}
          icon="event_busy"
          tone="warning"
          caption="Below 75%"
        />
        <StatCard
          label="Low GPA"
          value={rows.filter((row) => row.low_gpa).length}
          icon="trending_down"
          tone="warning"
          caption="Below 6"
        />
        <StatCard
          label="With backlogs"
          value={rows.filter((row) => row.has_backlog).length}
          icon="assignment_late"
          tone="info"
          caption="One is enough to flag"
        />
      </div>

      {withoutLink > 0 && (
        <div className="mb-4 rounded-xl border border-topbar-border bg-primary-fixed/40 px-4 py-3">
          <p className="text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined mr-1 align-middle text-[18px] text-primary">info</span>
            {withoutLink} meeting{withoutLink === 1 ? '' : 's'} {withoutLink === 1 ? 'is' : 'are'} waiting on a
            join link. The meeting platform (Teams or Google Meet) has not been finalised yet, so links are
            not being generated — contact the student directly in the meantime.
          </p>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} columns={9} />
      ) : (
        <Panel bodyClassName="">
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.student_id}
            emptyState={
              <EmptyState
                icon="verified"
                title={rows.length ? 'No students match your search' : 'Nobody is flagged right now'}
                description={
                  rows.length
                    ? 'Try a different name, registration number or section.'
                    : 'Students appear here automatically when attendance drops below 75%, GPA falls below 6, or a backlog is recorded.'
                }
              />
            }
          />
        </Panel>
      )}
    </PortalShell>
  );
}
