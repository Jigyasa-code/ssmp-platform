/**
 * FEATURE 2 — Semester-wise GPA with a student-controlled sharing toggle.
 *
 * Important distinction: the toggle is about *visibility*, not permission.
 * GPA entry is always available to the student; the switch only decides
 * whether faculty reports include the numbers. The rule is enforced in the
 * database (see can_view_student_gpa in migration 0007), not here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import { ToggleSwitch } from '../../components/ui/FormControls.jsx';
import { TrendLineChart } from '../../components/charts/Charts.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { describeError } from '../../lib/formatters.js';
import { CHART_COLORS } from '../../lib/constants.js';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function StudentAcademicsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { run, pending } = useAsyncAction();

  const [gpas, setGpas] = useState([]);
  const [sharing, setSharing] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSemester, setSavingSemester] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: gpaRows, error: gpaError }, { data: formA }] = await Promise.all([
      supabase.from('student_semester_gpas').select('*').eq('student_id', profile.id).order('semester_number'),
      supabase.from('student_form_a_profiles').select('gpa_sharing_enabled').eq('student_id', profile.id).maybeSingle()
    ]);

    if (gpaError) toast.error(describeError(gpaError));
    setGpas(gpaRows ?? []);
    setSharing(formA?.gpa_sharing_enabled ?? true);
    setDrafts(Object.fromEntries((gpaRows ?? []).map((row) => [row.semester_number, String(row.gpa)])));
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

  const toggleSharing = (next) =>
    run(
      async () => {
        const { error } = await supabase.rpc('set_gpa_sharing', { p_enabled: next });
        if (error) throw error;
        setSharing(next);
      },
      {
        successMessage: next
          ? 'Your mentor can now see your semester GPA.'
          : 'GPA hidden. Faculty reports will show "not shared" instead.'
      }
    );

  const stats = useMemo(() => {
    if (!gpas.length) return { cgpa: '—', highest: '—', lowest: '—', recorded: 0, trend: null };
    const values = gpas.map((g) => Number(g.gpa));
    const cgpa = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
    const sorted = [...gpas].sort((a, b) => a.semester_number - b.semester_number);
    const trend =
      sorted.length < 2 ? null : Number(sorted.at(-1).gpa) - Number(sorted.at(-2).gpa);
    return {
      cgpa,
      highest: Math.max(...values).toFixed(2),
      lowest: Math.min(...values).toFixed(2),
      recorded: gpas.length,
      trend: trend == null ? null : Number(trend.toFixed(2))
    };
  }, [gpas]);

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
        subtitle="Record your semester GPA and decide whether your mentor can see it."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="CGPA so far" value={stats.cgpa} icon="school" tone="primary" caption={`${stats.recorded} of 8 semesters`} />
        <StatCard label="Highest semester" value={stats.highest} icon="trending_up" tone="success" />
        <StatCard label="Lowest semester" value={stats.lowest} icon="trending_down" tone="warning" />
        <StatCard
          label="Latest change"
          value={stats.trend == null ? '—' : `${stats.trend > 0 ? '+' : ''}${stats.trend}`}
          icon="show_chart"
          tone={stats.trend == null ? 'slate' : stats.trend >= 0 ? 'success' : 'error'}
          caption="vs previous semester"
        />
      </div>

      <Panel tab="Sharing preference" tabIcon="visibility" className="mt-5">
        <ToggleSwitch
          label="Share my semester GPA with my faculty mentor"
          description={
            sharing
              ? 'Your mentor and the HOD can see these grades in mentorship reports.'
              : 'Your grades are hidden from faculty reports. You can still record them here, and the HOD retains institutional access.'
          }
          checked={sharing}
          onChange={toggleSharing}
          disabled={pending}
        />
      </Panel>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Panel tab="GPA entry" tabIcon="edit_note" className="lg:col-span-2">
          <p className="mb-3 text-body-sm text-on-surface-variant">
            Enter the GPA you received for each completed semester. Leave the rest blank.
          </p>
          <ul className="space-y-2">
            {SEMESTERS.map((semester) => {
              const saved = gpas.find((g) => g.semester_number === semester);
              return (
                <li key={semester} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-body-sm text-on-surface-variant">Semester {semester}</span>
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
