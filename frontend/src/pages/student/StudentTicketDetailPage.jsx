import { Link, useParams } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import { TicketStatusBadge, CategoryBadge, PriorityBadge, ResolutionBadge } from '../../components/ui/StatusBadge.jsx';
import TicketConversation from '../../components/tickets/TicketConversation.jsx';
import ResolutionConfirmation from '../../components/tickets/ResolutionConfirmation.jsx';
import SatisfactionRating from '../../components/tickets/SatisfactionRating.jsx';
import { useTicketThread } from '../../hooks/useRealtimeTickets.js';
import { formatDateTime } from '../../lib/formatters.js';

export default function StudentTicketDetailPage() {
  const { ticketId } = useParams();
  const { ticket, messages, loading, error, reload, appendMessage } = useTicketThread(ticketId);

  if (loading) return <PortalShell><PageLoader label="Loading ticket..." /></PortalShell>;

  if (error || !ticket) {
    return (
      <PortalShell>
        <EmptyState
          icon="error"
          title="Ticket not available"
          description={error ?? 'This ticket does not exist, or it is not yours to view.'}
          action={<Link to="/student/tickets" className="btn-primary">Back to my tickets</Link>}
        />
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <PageHeader
        breadcrumb={
          <Link to="/student/tickets" className="hover:text-primary hover:underline">
            ← My tickets
          </Link>
        }
        title={ticket.subject}
        subtitle={`${ticket.ticket_code} · raised ${formatDateTime(ticket.created_at)}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TicketStatusBadge status={ticket.status} />
        <ResolutionBadge resolutionStatus={ticket.resolution_status} />
        <CategoryBadge category={ticket.category} />
        <PriorityBadge priority={ticket.priority} />
      </div>

      <div className="mb-4">
        <ResolutionConfirmation ticket={ticket} onDone={reload} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel tab="Conversation" tabIcon="forum" className="lg:col-span-2" bodyClassName="">
          <div className="h-[560px]">
            <TicketConversation
              ticket={ticket}
              messages={messages}
              onPosted={reload}
              onOptimisticMessage={appendMessage}
              readOnly={ticket.resolution_status === 'confirmed'}
            />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel tab="Details" tabIcon="info">
            <dl className="space-y-3 text-body-sm">
              {[
                ['Assigned mentor', ticket.mentor?.full_name ?? '—'],
                ['Mentor email', ticket.mentor?.email ?? '—'],
                ['Raised on', formatDateTime(ticket.created_at)],
                ['Last update', formatDateTime(ticket.last_message_at)],
                ['Resolved on', ticket.resolved_at ? formatDateTime(ticket.resolved_at) : 'Not yet'],
                ['Times reopened', String(ticket.reopen_count ?? 0)]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-label-sm uppercase tracking-wide text-tertiary">{label}</dt>
                  <dd className="mt-0.5 break-anywhere text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          {ticket.status === 'Resolved' && (
            <Panel tab="Your feedback" tabIcon="star">
              <SatisfactionRating ticket={ticket} onRated={reload} />
            </Panel>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
