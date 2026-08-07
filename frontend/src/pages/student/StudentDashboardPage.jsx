import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { SkeletonCards } from '../../components/ui/Skeleton.jsx';
import { TicketStatusBadge, CategoryBadge, ResolutionBadge } from '../../components/ui/StatusBadge.jsx';
import { DonutChart, CategoryBarChart } from '../../components/charts/Charts.jsx';
import CreateTicketModal from '../../components/tickets/CreateTicketModal.jsx';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics.js';
import { useRealtimeTickets } from '../../hooks/useRealtimeTickets.js';
import { formatRelativeTime, formatHours } from '../../lib/formatters.js';
import { CHART_COLORS } from '../../lib/constants.js';

export default function StudentDashboardPage() {
  const { profile } = useAuth();
  const { metrics, loading, reload } = useDashboardMetrics();
  const { tickets, reload: reloadTickets } = useRealtimeTickets({ pageSize: 5 });
  const [createOpen, setCreateOpen] = useState(false);

  const statusData = useMemo(
    () => [
      { name: 'Open', value: metrics?.open_tickets ?? 0, color: CHART_COLORS.open },
      { name: 'In Progress', value: metrics?.in_progress_tickets ?? 0, color: CHART_COLORS.inProgress },
      { name: 'Resolved', value: metrics?.resolved_tickets ?? 0, color: CHART_COLORS.resolved }
    ],
    [metrics]
  );

  const categoryData = useMemo(() => {
    const counts = { Academic: 0, 'ERP/Tech': 0, Infrastructure: 0 };
    for (const ticket of tickets) counts[ticket.category] = (counts[ticket.category] ?? 0) + 1;
    return [
      { name: 'Academic', value: counts.Academic, color: CHART_COLORS.academic },
      { name: 'ERP/Tech', value: counts['ERP/Tech'], color: CHART_COLORS.erpTech },
      { name: 'Infrastructure', value: counts.Infrastructure, color: CHART_COLORS.infrastructure }
    ];
  }, [tickets]);

  const awaiting = tickets.filter((t) => t.resolution_status === 'pending_confirmation');

  return (
    <PortalShell>
      <PageHeader
        title={`Welcome, ${profile?.full_name?.split(' ')[0] ?? 'Student'}`}
        subtitle="Raise a support request, follow its progress, and keep your mentorship record up to date."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <span className="material-symbols-outlined text-[18px]">add</span>
            Raise a ticket
          </button>
        }
      />

      {/* Mentor card — mirrors the SLCM "Class Coordinator Information" block */}
      <Panel tab="My Faculty Mentor" tabIcon="badge" className="mb-5">
        {profile?.mentor ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Name', profile.mentor.full_name],
              ['Email', profile.mentor.email],
              ['Phone', profile.mentor.phone ?? 'Not provided'],
              ['Faculty ID', profile.mentor.login_id ?? '—']
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-label-sm uppercase tracking-wide text-tertiary">{label}</dt>
                <dd className="mt-0.5 break-anywhere text-body-sm font-semibold text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-body-sm text-on-surface-variant">
            No mentor has been assigned to you yet. Please contact the HOD office.
          </p>
        )}
      </Panel>

      {awaiting.length > 0 && (
        <div className="mb-5 rounded-lg border-l-4 border-info bg-info-container/50 p-4">
          <p className="text-label-md text-on-surface">
            {awaiting.length} ticket{awaiting.length > 1 ? 's are' : ' is'} waiting for your confirmation
          </p>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            Your mentor marked them resolved. Let us know whether the issue is actually fixed.
          </p>
          <Link to="/student/tickets" className="btn-primary btn-sm mt-3">
            Review now
          </Link>
        </div>
      )}

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total tickets" value={metrics?.total_tickets ?? 0} icon="confirmation_number" tone="primary" />
          <StatCard label="Open" value={metrics?.open_tickets ?? 0} icon="pending" tone="error" caption="not yet picked up" />
          <StatCard label="In progress" value={metrics?.in_progress_tickets ?? 0} icon="autorenew" tone="warning" />
          <StatCard
            label="Avg resolution time"
            value={formatHours(metrics?.avg_resolution_hours)}
            icon="timer"
            tone="success"
            caption={`${metrics?.resolved_tickets ?? 0} resolved`}
          />
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Panel tab="Status mix" tabIcon="donut_small" className="lg:col-span-1">
          <DonutChart data={statusData} centerLabel="tickets" height={240} />
        </Panel>
        <Panel tab="Recent activity by category" tabIcon="bar_chart" className="lg:col-span-2">
          <CategoryBarChart data={categoryData} height={240} />
        </Panel>
      </div>

      <Panel
        tab="My recent tickets"
        tabIcon="history"
        className="mt-5"
        bodyClassName=""
        actions={null}
      >
        {tickets.length === 0 ? (
          <EmptyState
            icon="confirmation_number"
            title="No tickets yet"
            description="When you need academic, ERP or infrastructure help, raise a ticket and your mentor will pick it up."
            action={
              <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
                Raise your first ticket
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-surface-container">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={`/student/tickets/${ticket.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-low"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label-md text-on-surface">{ticket.subject}</span>
                    <span className="text-label-sm text-tertiary">
                      {ticket.ticket_code} · updated {formatRelativeTime(ticket.last_message_at)}
                    </span>
                  </span>
                  <CategoryBadge category={ticket.category} />
                  <TicketStatusBadge status={ticket.status} />
                  <ResolutionBadge resolutionStatus={ticket.resolution_status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <CreateTicketModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mentorName={profile?.mentor?.full_name}
        onCreated={() => {
          reload();
          reloadTickets();
        }}
      />
    </PortalShell>
  );
}
