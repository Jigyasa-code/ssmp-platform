/**
 * Mentee detail — everything a mentor needs about one student in one
 * place: Form A (Feature 1), GPA if shared (Feature 2), achievements with
 * verification (Feature 6), star toggle (Feature 7) and the full ticket
 * history, plus a one-click PDF (Feature 5).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import { TicketStatusBadge, CategoryBadge } from '../../components/ui/StatusBadge.jsx';
import { TrendLineChart, DonutChart } from '../../components/charts/Charts.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { apiClient } from '../../lib/apiClient.js';
import { createSignedUrl, BUCKETS } from '../../lib/fileUpload.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ACHIEVEMENT_CATEGORIES, CHART_COLORS } from '../../lib/constants.js';
import { describeError, formatDate, formatHours } from '../../lib/formatters.js';

export default function FacultyMenteeDetailPage({ isHodView = false }) {
  const { studentId } = useParams();
  const toast = useToast();
  const { run, pending } = useAsyncAction();
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_student_dossier', { p_student_id: studentId });
    if (error) toast.error(describeError(error));
    setDossier(data ?? null);
    setLoading(false);
  }, [studentId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleVerify = (achievement) =>
    run(
      async () => {
        const { error } = await supabase.rpc('set_achievement_verification', {
          p_achievement_id: achievement.id,
          p_verified: !achievement.verified
        });
        if (error) throw error;
      },
      {
        successMessage: achievement.verified ? 'Verification removed.' : 'Achievement verified.',
        onSuccess: load
      }
    );

  const toggleStar = () =>
    run(
      async () => {
        const { error } = await supabase.rpc('set_star_mentee', {
          p_student_id: studentId,
          p_is_star: !dossier.student.is_star_mentee
        });
        if (error) throw error;
      },
      { successMessage: 'Representative updated.', onSuccess: load }
    );

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      await apiClient.downloadFile(
        '/reports/student-dossier-report',
        { student_id: studentId, format: 'pdf' },
        'student-report.pdf'
      );
      toast.success('Report downloaded.');
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setDownloading(false);
    }
  };

  const viewProof = async (path) => {
    try {
      const url = await createSignedUrl(BUCKETS.ACHIEVEMENTS, path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  if (loading) return <PortalShell><PageLoader label="Loading student record..." /></PortalShell>;

  if (!dossier) {
    return (
      <PortalShell>
        <EmptyState
          icon="person_off"
          title="Student not available"
          description="This student does not exist, or they are not in your mentor group."
          action={
            <Link to={isHodView ? '/hod/students' : '/faculty/mentees'} className="btn-primary">
              Back to the list
            </Link>
          }
        />
      </PortalShell>
    );
  }

  const { student, form_a: formA, ticket_summary: tickets, gpa_stats: gpaStats } = dossier;
  const backPath = isHodView ? '/hod/students' : '/faculty/mentees';

  const gpaChart = (dossier.semester_gpas ?? []).map((g) => ({
    name: `Sem ${g.semester}`,
    gpa: Number(g.gpa)
  }));

  const categoryChart = [
    { name: 'Academic', value: tickets.academic, color: CHART_COLORS.academic },
    { name: 'ERP/Tech', value: tickets.erp_tech, color: CHART_COLORS.erpTech },
    { name: 'Infrastructure', value: tickets.infrastructure, color: CHART_COLORS.infrastructure }
  ];

  return (
    <PortalShell>
      <PageHeader
        breadcrumb={
          <Link to={backPath} className="hover:text-primary hover:underline">
            ← {isHodView ? 'Students' : 'My mentees'}
          </Link>
        }
        title={student.name}
        subtitle={`${student.registration_no ?? '—'} · ${student.branch ?? '—'} · Section ${student.section ?? '—'}`}
        actions={
          <>
            {!isHodView && (
              <button type="button" className="btn-secondary" onClick={toggleStar} disabled={pending}>
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: student.is_star_mentee ? "'FILL' 1" : "'FILL' 0" }}
                >
                  star
                </span>
                {student.is_star_mentee ? 'Remove as representative' : 'Make representative'}
              </button>
            )}
            <button type="button" className="btn-primary" onClick={downloadPdf} disabled={downloading}>
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              {downloading ? 'Building report...' : 'Generate report'}
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CGPA"
          value={dossier.gpa_shared ? (gpaStats?.cgpa ?? '—') : 'Not shared'}
          icon="school"
          tone={dossier.gpa_shared ? 'primary' : 'slate'}
          caption={dossier.gpa_shared ? `${gpaStats?.semesters_recorded ?? 0} semesters recorded` : 'student has hidden GPA'}
        />
        <StatCard label="Tickets raised" value={tickets.total} icon="confirmation_number" tone="secondary"
          caption={`${tickets.resolved} resolved`} />
        <StatCard label="Achievements" value={dossier.achievements.length} icon="military_tech" tone="success"
          caption={`${dossier.achievements.filter((a) => a.verified).length} verified`} />
        <StatCard label="Avg resolution" value={formatHours(tickets.avg_resolution_hours)} icon="timer" tone="info" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel tab="Academic trend" tabIcon="show_chart" className="lg:col-span-2">
          {dossier.gpa_shared ? (
            <TrendLineChart
              data={gpaChart}
              height={260}
              domain={[0, 10]}
              lines={[{ key: 'gpa', label: 'GPA', color: CHART_COLORS.primary }]}
            />
          ) : (
            <EmptyState
              icon="visibility_off"
              title="GPA not shared"
              description="This student has turned off GPA sharing. You can still see everything else in their record."
            />
          )}
        </Panel>

        <Panel tab="Ticket mix" tabIcon="donut_small">
          <DonutChart data={categoryChart} centerLabel="tickets" height={260} />
        </Panel>
      </div>

      <Panel tab="Form A record" tabIcon="assignment" className="mt-4">
        {formA ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Date of birth', formatDate(formA.date_of_birth)],
              ['Blood group', formA.blood_group],
              ['Mobile', formA.mobile_no],
              ['Email', formA.email],
              ['Hostel', formA.is_day_scholar ? 'Day scholar' : `${formA.hostel_block ?? '—'} / Room ${formA.room_no ?? '—'}`],
              ['MUJ alumni in family', formA.has_muj_alumni_in_family ? 'Yes' : 'No'],
              ["Father", `${formA.father.name}${formA.father.occupation ? ` (${formA.father.occupation})` : ''}`],
              ["Mother", `${formA.mother.name}${formA.mother.occupation ? ` (${formA.mother.occupation})` : ''}`],
              ['Communication address', `${formA.communication_address}, ${formA.communication_pin_code}`],
              ['Permanent address', `${formA.permanent_address}, ${formA.permanent_pin_code}`],
              ['Submitted', formatDate(formA.submitted_at)]
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-label-sm uppercase tracking-wide text-tertiary">{label}</dt>
                <dd className="mt-0.5 break-anywhere text-body-sm text-on-surface">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState
            icon="assignment_late"
            title="Form A not submitted"
            description="This student has not completed their one-time onboarding form yet."
          />
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel tab={`Achievements (${dossier.achievements.length})`} tabIcon="military_tech" bodyClassName="">
          {dossier.achievements.length === 0 ? (
            <EmptyState icon="military_tech" title="No achievements recorded" description="Nothing added by the student yet." />
          ) : (
            <ul className="divide-y divide-surface-container">
              {dossier.achievements.map((achievement) => {
                const meta = ACHIEVEMENT_CATEGORIES.find((c) => c.value === achievement.category);
                return (
                  <li key={achievement.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <span className="material-symbols-outlined mt-0.5 text-[20px] text-primary" aria-hidden="true">
                      {meta?.icon ?? 'star'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-label-md text-on-surface">{achievement.title}</span>
                      <span className="text-label-sm text-tertiary">
                        {meta?.label} · {formatDate(achievement.achieved_on)}
                      </span>
                      {achievement.description && (
                        <span className="mt-1 block text-body-sm text-on-surface-variant">{achievement.description}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      {achievement.proof_file_path && (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => viewProof(achievement.proof_file_path)}>
                          Proof
                        </button>
                      )}
                      <button
                        type="button"
                        className={achievement.verified ? 'btn-ghost btn-sm text-success' : 'btn-secondary btn-sm'}
                        onClick={() => toggleVerify(achievement)}
                        disabled={pending}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {achievement.verified ? 'verified' : 'check'}
                        </span>
                        {achievement.verified ? 'Verified' : 'Verify'}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel tab="Ticket history" tabIcon="history" bodyClassName="">
          <DataTable
            dense
            columns={[
              { key: 'ticket_code', header: 'Ref' },
              { key: 'subject', header: 'Subject' },
              { key: 'category', header: 'Category', render: (row) => <CategoryBadge category={row.category} /> },
              { key: 'status', header: 'Status', render: (row) => <TicketStatusBadge status={row.status} /> },
              { key: 'created_at', header: 'Raised', render: (row) => formatDate(row.created_at) }
            ]}
            rows={dossier.tickets ?? []}
            rowKey={(row) => row.ticket_code}
            emptyState={<EmptyState icon="inbox" title="No tickets" description="This student has not raised any tickets." />}
          />
        </Panel>
      </div>
    </PortalShell>
  );
}
