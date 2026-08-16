/**
 * FEATURE 2 — Semester-wise GPA.
 *
 * THE SHARING TOGGLE WAS REMOVED FROM THIS SCREEN.
 * gpa_sharing_enabled still exists on student_form_a_profiles, still
 * defaults to true, and can_view_student_gpa() in migration 0007 still
 * reads it — so the mechanism is intact and could be re-exposed without a
 * migration. What changed is that a student is no longer offered the
 * choice: mentors now need GPA to do the at-risk work, and a per-student
 * opt-out made the At-Risk Students page inconsistent about who it could
 * explain. set_gpa_sharing() is left in place and simply not called.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import { TrendLineChart } from '../../components/charts/Charts.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { describeError, formatDate } from '../../lib/formatters.js';
import { CHART_COLORS } from '../../lib/constants.js';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function StudentAcademicsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { run, pending } = useAsyncAction();

  const [gpas, setGpas] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSemester, setSavingSemester] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [gpaResult, attendanceResult] = await Promise.all([
      supabase
        .from('student_semester_gpas')
        .select('*')
        .eq('student_id', profile.id)
        .order('semester_number'),
      // One row per course, most recent reporting period. RLS scopes it to
      // the caller; the explicit filter is only to keep the query narrow.
      supabase
        .from('student_attendance_overview')
        .select('*')
        .eq('student_id', profile.id)
        .order('course_code')
    ]);

    if (gpaResult.error) toast.error(describeError(gpaResult.error));
    if (attendanceResult.error) toast.error(describeError(attendanceResult.error));

    setGpas(gpaResult.data ?? []);
    setAttendance(attendanceResult.data ?? []);
    setDrafts(
      Object.fromEntries((gpaResult.data ?? []).map((row) => [row.semester_number, String(row.gpa)]))
    );
    setLoading(false);
  }, [profile.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveGpa = (semester) => {
    const raw = drafts[semester];
    if (raw === undefined || raw === '') return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      toast.error('GPA must be a number between 0 and 10.');
      return;
    }
    setSavingSemester(semester);
    run(
      async () => {
        const { error } = await supabase.rpc('upsert_semester_gpa', {
          p_semester_number: semester,
          p_gpa: value
        });
        if (error) throw error;
      },
      { successMessage: `Semester ${semester} GPA saved.`, onSuccess: load }
    ).finally(() => setSavingSemester(null));
  };

  const stats = useMemo(() => {
    if (!gpas.length) return { cgpa: '—', highest: '—', lowest: '—', recorded: 0 };
    const values = gpas.map((g) => Number(g.gpa));
    return {
      cgpa: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      highest: Math.max(...values).toFixed(2),
      lowest: Math.min(...values).toFixed(2),
      recorded: gpas.length
    };
  }, [gpas]);

  /**
   * Overall attendance is the mean of the per-course percentages — the
   * same figure evaluate_student_risk() uses, so the number here and the
   * number a mentor sees on the At-Risk page can never disagree.
   */
  const overallAttendance = useMemo(() => {
    if (!attendance.length) return null;
    const total = attendance.reduce((sum, row) => sum + Number(row.attendance_percent ?? 0), 0);
    return Math.round((total / attendance.length) * 100) / 100;
  }, [attendance]);

  const chartData = useMemo(
    () =>
      [...gpas]
        .sort((a, b) => a.semester_number - b.semester_number)
        .map((row) => ({ name: `Sem ${row.semester_number}`, gpa: Number(row.gpa) })),
    [gpas]
  );

  if (loading) return <PortalShell><PageLoader label="Loading your academic record..." /></PortalShell>;

  return (
    <PortalShell>
      <PageHeader
        title="Academics"
        subtitle="Record the GPA you received for each completed semester."
      />

      {/* "Latest change" was removed — the GPA trend chart below says the
          same thing more legibly, and a single-semester student saw only a
          dash. The sharing toggle went with it; see the note at the top of
          this file. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="CGPA so far" value={stats.cgpa} icon="school" tone="primary" caption={`${stats.recorded} of 8 semesters`} />
        <StatCard label="Highest semester" value={stats.highest} icon="trending_up" tone="success" />
        <StatCard label="Lowest semester" value={stats.lowest} icon="trending_down" tone="warning" />
        <StatCard
          label="Overall attendance"
          value={overallAttendance == null ? '—' : `${overallAttendance}%`}
          icon="fact_check"
          tone={overallAttendance == null ? 'slate' : overallAttendance < 75 ? 'error' : 'success'}
          caption={
            attendance.length
              ? `Across ${attendance.length} course${attendance.length === 1 ? '' : 's'}`
              : 'Not published yet'
          }
        />
      </div>

      {/* Attendance, exactly as the department published it. The
          percentage shown is the one from the ERP export — it is never
          recalculated here, so this table and the ERP always agree. */}
      <Panel
        className="mt-5"
        tab="Attendance by course"
        tabIcon="fact_check"
        bodyClassName=""
        actions={
          overallAttendance != null && overallAttendance < 75 ? (
            <span className="chip bg-error-container text-on-error-container">Below 75% overall</span>
          ) : null
        }
      >
        <DataTable
          columns={[
            { key: 'course_code', header: 'Course code' },
            { key: 'course_name', header: 'Course name' },
            { key: 'section_label', header: 'Section', align: 'center' },
            {
              key: 'attendance_percent',
              header: 'Attendance',
              align: 'right',
              render: (row) => {
                const percent = Number(row.attendance_percent);
                return (
                  <span className={percent < 75 ? 'text-error' : 'text-on-surface'}>
                    {percent.toFixed(2).replace(/\.00$/, '')}%
                  </span>
                );
              }
            },
            {
              key: 'period',
              header: 'Period',
              render: (row) =>
                row.period_start ? `${formatDate(row.period_start)} — ${formatDate(row.period_end)}` : '—'
            }
          ]}
          rows={attendance}
          rowKey={(row) => row.course_id}
          emptyState={
            <EmptyState
              icon="fact_check"
              title="No attendance published yet"
              description="Your attendance appears here as soon as the department uploads it. The section shown is the teaching section for each course, which can differ from your Form A section."
            />
          }
        />
      </Panel>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Panel tab="GPA entry" tabIcon="edit_note" className="lg:col-span-2">
          <p className="mb-3 text-body-sm text-on-surface-variant">
            Enter the GPA you received for each completed semester. Leave the rest blank. Semesters the
            department has already published are shown as read-only.
          </p>
          <ul className="space-y-2">
            {SEMESTERS.map((semester) => {
              const saved = gpas.find((g) => g.semester_number === semester);
              // A departmental figure cannot be edited here — the database
              // refuses it (see upsert_semester_gpa), so the input is not
              // offered rather than offered and then rejected.
              const official = saved?.source === 'cluster_head';

              return (
                <li key={semester} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-body-sm text-on-surface-variant">Semester {semester}</span>

                  {official ? (
                    <>
                      <span className="w-28 shrink-0 text-body-sm text-on-surface">{Number(saved.gpa).toFixed(2)}</span>
                      <span className="chip bg-primary-fixed text-on-primary-fixed">Published by the department</span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`Semester ${semester} GPA`}
                        className="field-input w-28"
                        value={drafts[semester] ?? ''}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [semester]: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={pending || (drafts[semester] ?? '') === ''}
                        onClick={() => saveGpa(semester)}
                      >
                        {savingSemester === semester ? 'Saving...' : saved ? 'Update' : 'Save'}
                      </button>
                      {saved && (
                        <span className="material-symbols-outlined text-[18px] text-success" aria-label="Saved">
                          check_circle
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel tab="GPA trend" tabIcon="show_chart" className="lg:col-span-3">
          <TrendLineChart
            data={chartData}
            height={320}
            domain={[0, 10]}
            lines={[{ key: 'gpa', label: 'GPA', color: CHART_COLORS.primary }]}
          />
        </Panel>
      </div>
    </PortalShell>
  );
}
