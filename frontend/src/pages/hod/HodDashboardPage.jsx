import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { SkeletonCards } from '../../components/ui/Skeleton.jsx';
import { DonutChart, CategoryBarChart, AreaTrendChart, GaugeChart } from '../../components/charts/Charts.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics.js';
import { CHART_COLORS } from '../../lib/constants.js';
import { formatHours, percentage } from '../../lib/formatters.js';

export default function HodDashboardPage() {
  const { metrics, loading } = useDashboardMetrics();
  const [leaderboard, setLeaderboard] = useState([]);
  const [trend, setTrend] = useState([]);

  const loadExtras = useCallback(async () => {
    const [{ data: faculty }, { data: daily }] = await Promise.all([
      supabase.from('faculty_performance_summary').select('*').order('resolved_tickets', { ascending: false }).limit(10),
      supabase.from('ticket_daily_trend').select('*').order('day', { ascending: true }).limit(400)
    ]);
    setLeaderboard(faculty ?? []);

    // Roll the per-mentor daily rows up into a department-wide series.
    const byDay = new Map();
    for (const row of daily ?? []) {
      const current = byDay.get(row.day) ?? { raised: 0, resolved: 0 };
      current.raised += row.tickets_created;
      current.resolved += row.tickets_resolved;
      byDay.set(row.day, current);
    }
    setTrend(
      [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([day, values]) => ({
          name: new Date(day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          raised: values.raised,
          resolved: values.resolved
        }))
    );
  }, []);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  const statusData = useMemo(
    () => [
      { name: 'Open', value: metrics?.open_tickets ?? 0, color: CHART_COLORS.open },
      { name: 'In Progress', value: metrics?.in_progress_tickets ?? 0, color: CHART_COLORS.inProgress },
      { name: 'Resolved', value: metrics?.resolved_tickets ?? 0, color: CHART_COLORS.resolved }
    ],
    [metrics]
  );

  const categoryData = useMemo(
    () => [
      { name: 'Academic', value: metrics?.academic_tickets ?? 0, color: CHART_COLORS.academic },
      { name: 'ERP/Tech', value: metrics?.erp_tech_tickets ?? 0, color: CHART_COLORS.erpTech },
      { name: 'Infrastructure', value: metrics?.infrastructure_tickets ?? 0, color: CHART_COLORS.infrastructure }
    ],
    [metrics]
  );

  return (
    <PortalShell>
      <PageHeader
        title="Department overview"
        subtitle="Live picture of support load, faculty performance and onboarding across the department."
        actions={
          <>
            <Link to="/hod/semester" className="btn-secondary">
              <span className="material-symbols-outlined text-[18px]">event_note</span>
              Semester setup
            </Link>
            <Link to="/hod/roster" className="btn-primary">
              <span className="material-symbols-outlined text-[18px]">badge</span>
              Faculty roster
            </Link>
          </>
        }
      />

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Students" value={metrics?.total_students ?? 0} icon="school" tone="primary"
              caption={`${metrics?.unassigned_students ?? 0} without a mentor`} />
            <StatCard label="Faculty mentors" value={metrics?.total_faculty ?? 0} icon="badge" tone="info"
              caption={`${metrics?.active_faculty ?? 0} active · ${metrics?.departed_faculty ?? 0} departed`} />
            <StatCard label="Total tickets" value={metrics?.total_tickets ?? 0} icon="confirmation_number" tone="secondary"
              caption={`${metrics?.resolved_tickets ?? 0} resolved`} />
            <StatCard label="Onboarding pending" value={metrics?.onboarding_pending ?? 0} icon="assignment_late"
              tone={metrics?.onboarding_pending ? 'warning' : 'success'} caption="Form A not submitted" />
          </div>

          {(metrics?.unassigned_students > 0 || metrics?.departed_faculty > 0) && (
            <div className="mt-4 rounded-lg border-l-4 border-warning bg-warning-container/50 p-4">
              <p className="text-label-md text-on-surface">Attention needed</p>
              <ul className="mt-1 space-y-0.5 text-body-sm text-on-surface-variant">
                {metrics.unassigned_students > 0 && (
                  <li>{metrics.unassigned_students} student(s) have no mentor assigned.</li>
                )}
                {metrics.departed_faculty > 0 && (
                  <li>{metrics.departed_faculty} faculty member(s) are marked as departed — check their mentee lists.</li>
                )}
              </ul>
              <Link to="/hod/roster" className="btn-primary btn-sm mt-3">
                Open faculty roster
              </Link>
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <Panel tab="Status mix" tabIcon="donut_small">
              <DonutChart data={statusData} centerLabel="tickets" height={230} />
            </Panel>
            <Panel tab="Category load" tabIcon="bar_chart">
              <CategoryBarChart data={categoryData} height={230} />
            </Panel>
            <Panel tab="Resolution rate" tabIcon="speed">
              <GaugeChart
                value={percentage(metrics?.resolved_tickets, metrics?.total_tickets, 1)}
                label="resolved"
                height={230}
              />
            </Panel>
            <Panel tab="Service quality" tabIcon="insights">
              <dl className="space-y-4 py-2">
                {[
                  ['Avg first response', formatHours(metrics?.avg_first_response_hours)],
                  ['Avg resolution', formatHours(metrics?.avg_resolution_hours)],
                  ['Avg satisfaction', metrics?.avg_satisfaction ? `${metrics.avg_satisfaction}/5` : '—'],
                  ['Awaiting confirmation', String(metrics?.awaiting_confirmation ?? 0)],
                  ['Reopened by students', String(metrics?.reopened_tickets ?? 0)]
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-body-sm text-tertiary">{label}</dt>
                    <dd className="text-headline-sm text-on-surface">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>

          <Panel tab="Ticket volume — last 30 days" tabIcon="show_chart" className="mt-4">
            <AreaTrendChart data={trend} areaKey="raised" label="Tickets raised" height={240} />
          </Panel>

          <Panel tab="Faculty response leaderboard" tabIcon="leaderboard" className="mt-4" bodyClassName=""
            actions={<Link to="/hod/performance" className="btn-ghost btn-sm">View full comparison</Link>}>
            <DataTable
              columns={[
                {
                  key: 'faculty_name',
                  header: 'Faculty',
                  render: (row) => (
                    <span>
                      <span className="block text-on-surface">{row.faculty_name}</span>
                      <span className="text-label-sm text-tertiary">{row.branch ?? '—'}</span>
                    </span>
                  )
                },
                { key: 'mentee_count', header: 'Mentees', align: 'right' },
                { key: 'total_tickets', header: 'Tickets', align: 'right' },
                { key: 'resolved_tickets', header: 'Resolved', align: 'right' },
                {
                  key: 'avg_first_response_hours',
                  header: 'Avg 1st response',
                  align: 'right',
                  render: (row) => formatHours(row.avg_first_response_hours)
                },
                {
                  key: 'resolution_rate_percent',
                  header: 'Resolution rate',
                  align: 'right',
                  render: (row) => `${row.resolution_rate_percent ?? 0}%`
                },
                {
                  key: 'avg_satisfaction',
                  header: 'Rating',
                  align: 'right',
                  render: (row) => (row.avg_satisfaction ? `${row.avg_satisfaction}/5` : '—')
                }
              ]}
              rows={leaderboard}
              rowKey={(row) => row.faculty_id}
              emptyState={<EmptyState icon="badge" title="No faculty yet" description="Import the faculty roster to get started." />}
            />
          </Panel>
        </>
      )}
    </PortalShell>
  );
}
