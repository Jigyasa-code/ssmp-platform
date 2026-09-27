/**
 * Academics — the student's own academic record.
 *
 * The top of the page is the Academic Performance Overview (attendance per
 * subject, GPA, backlogs with their subjects, black dots), the same block
 * the mentor and the HOD see on this student's page. Underneath, the
 * student can record the GPA of any semester the department has not
 * published (Feature 2).
 *
 * Every read here is RLS-scoped to the caller: attendance through
 * student_attendance_overview, GPA and CGPA through can_view_student_gpa(),
 * backlogs and black dots through can_access_student(). The explicit
 * student_id filters only keep the queries narrow.
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
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import AcademicOverview from '../../components/academics/AcademicOverview.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { describeError } from '../../lib/formatters.js';
import { formatGpa } from '../../lib/academicRecord.js';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function StudentAcademicsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { run, pending } = useAsyncAction();

  const [record, setRecord] = useState({ gpas: [], cgpa: null, attendance: [], backlogs: [], blackDots: [] });
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSemester, setSavingSemester] = useState(null);

  // A reload after saving something is quiet: the page stays where it is
  // (and on the semester being looked at) instead of flashing the loader.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    const [gpaResult, cgpaResult, attendanceResult, backlogResult, blackDotResult] = await Promise.all([
      supabase
        .from('student_semester_gpas')
        .select('*')
        .eq('student_id', profile.id)
        .order('semester_number'),
      // The official CGPA, once the department has uploaded the ERP export.
      supabase
        .from('student_cgpas')
        .select('cgpa, total_earned_credits, updated_at')
        .eq('student_id', profile.id)
        .maybeSingle(),
      // One row per subject, most recent reporting period.
      supabase
        .from('student_attendance_overview')
        .select('course_id, course_code, course_name, section_label, attendance_percent, classes_held, classes_attended, period_start, period_end')
        .eq('student_id', profile.id)
        .order('course_code'),
      supabase
        .from('student_backlogs')
        .select('subject_code, subject_name, semester_number, grade, credits, exam_session, is_cleared, cleared_at')
        .eq('student_id', profile.id),
      supabase
        .from('student_black_dots')
        .select('case_number, case_details, incident_date, incident_date_text, hostel_block, room_no, course_branch, previous_record, created_at')
        .eq('student_id', profile.id)
    ]);

    const results = [gpaResult, cgpaResult, attendanceResult, backlogResult, blackDotResult];
    for (const result of results) {
      if (result.error) toast.error(describeError(result.error));
    }
    // A quiet reload that fails keeps what is already on screen.
    if (quiet && results.some((result) => result.error)) return;

    const gpas = gpaResult.data ?? [];
    setRecord({
      gpas,
      cgpa: cgpaResult.data ?? null,
      attendance: attendanceResult.data ?? [],
      backlogs: backlogResult.data ?? [],
      blackDots: blackDotResult.data ?? []
    });
    setDrafts(Object.fromEntries(gpas.map((row) => [row.semester_number, String(row.gpa)])));
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
      { successMessage: `Semester ${semester} GPA saved.`, onSuccess: () => load({ quiet: true }) }
    ).finally(() => setSavingSemester(null));
  };

  // The overview takes one shape for all three pages that show it.
  const overview = useMemo(() => {
    const semesterGpas = record.gpas.map((row) => ({
      semester: row.semester_number,
      gpa: row.gpa,
      earned_credits: row.earned_credits,
      source: row.source
    }));
    // The published CGPA is credit-weighted, so once the department has
    // uploaded it, it replaces the plain average of the semesters.
    let cgpa = null;
    if (record.cgpa) {
      cgpa = { value: record.cgpa.cgpa, official: true, earnedCredits: record.cgpa.total_earned_credits };
    } else if (semesterGpas.length) {
      const mean = semesterGpas.reduce((sum, row) => sum + Number(row.gpa), 0) / semesterGpas.length;
      cgpa = { value: Math.round(mean * 100) / 100, official: false, earnedCredits: null };
    }
    return {
      semesterGpas,
      cgpa,
      backlogs: record.backlogs.map((row) => ({ ...row, semester: row.semester_number })),
      blackDots: record.blackDots.map((row) => ({ ...row, recorded_at: row.created_at }))
    };
  }, [record]);

  if (loading) return <PortalShell><PageLoader label="Loading your academic record..." /></PortalShell>;

  return (
    <PortalShell>
      <PageHeader
        title="Academics"
        subtitle="Your attendance, GPA, backlogs and black dots as the department recorded them, and the GPA you record yourself."
      />

      <AcademicOverview
        audience="student"
        semesterLabel={profile.semester_label}
        attendance={record.attendance}
        semesterGpas={overview.semesterGpas}
        cgpa={overview.cgpa}
        backlogs={overview.backlogs}
        blackDots={overview.blackDots}
      />

      <Panel tab="Record your GPA" tabIcon="edit_note" className="mt-6">
        <p className="mb-4 text-body-sm text-on-surface-variant">
          Enter the GPA you received for each completed semester and leave the rest blank. A semester the
          department has published is shown as read-only, and it replaces anything recorded here.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SEMESTERS.map((semester) => {
            const saved = record.gpas.find((g) => g.semester_number === semester);
            // A departmental figure cannot be edited here — the database
            // refuses it (see upsert_semester_gpa), so the input is not
            // offered rather than offered and then rejected.
            const official = saved?.source === 'cluster_head';

            return (
              <li key={semester} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
                <p className="flex items-center justify-between gap-2 text-label-sm uppercase tracking-wide text-on-surface-variant">
                  Semester {semester}
                  {saved && !official && (
                    <span className="material-symbols-outlined text-[18px] text-success" aria-label="Saved">
                      check_circle
                    </span>
                  )}
                </p>

                {official ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-headline-sm text-on-surface">{formatGpa(saved.gpa)}</span>
                    <span className="chip bg-primary-fixed text-on-primary-fixed">Published by the department</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`Semester ${semester} GPA`}
                      placeholder="—"
                      className="field-input w-24 py-2"
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
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </PortalShell>
  );
}
