import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { SelectField } from '../../components/ui/FormControls.jsx';
import { TicketStatusBadge, CategoryBadge, PriorityBadge, ResolutionBadge } from '../../components/ui/StatusBadge.jsx';
import TicketConversation from '../../components/tickets/TicketConversation.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useTicketThread } from '../../hooks/useRealtimeTickets.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { formatDateTime, formatHours } from '../../lib/formatters.js';
import { TICKET_PRIORITIES } from '../../lib/constants.js';

export default function FacultyTicketDetailPage({ isHodView = false }) {
  const { ticketId } = useParams();
  const { ticket, messages, loading, error, reload, appendMessage } = useTicketThread(ticketId);
  const { run, pending } = useAsyncAction();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [cannedReplies, setCannedReplies] = useState([]);

  const loadCanned = useCallback(async () => {
    const { data } = await supabase.from('canned_replies').select('*').order('title');
    setCannedReplies(data ?? []);
  }, []);

  useEffect(() => {
    loadCanned();
  }, [loadCanned]);

  const resolve = () =>
    run(
      async () => {
        const { error: rpcError } = await supabase.rpc('resolve_support_ticket', {
          p_ticket_id: ticket.id,
          p_note: null
        });
        if (rpcError) throw rpcError;
      },
      {
        successMessage: 'Marked resolved. The student has been asked to confirm.',
        onSuccess: () => {
          setResolveOpen(false);
          reload();
        }
      }
    );

  const changePriority = (priority) =>
    run(
      async () => {
        const { error: updateError } = await supabase
          .from('support_tickets')
          .update({ priority })
          .eq('id', ticket.id);
        if (updateError) throw updateError;
      },
      { successMessage: `Priority set to ${priority}.`, onSuccess: reload }
    );

  if (loading) return <PortalShell><PageLoader label="Loading ticket..." /></PortalShell>;

  if (error || !ticket) {
    return (
      <PortalShell>
        <EmptyState
          icon="error"
          title="Ticket not available"
          description={error ?? 'This ticket does not exist, or it is not assigned to you.'}
          action={
            <Link to={isHodView ? '/hod/tickets' : '/faculty/tickets'} className="btn-primary">
              Back to the queue
            </Link>
          }
        />
      </PortalShell>
    );
  }

  const canResolve = ticket.status !== 'Resolved' || ticket.resolution_status === 'reopened';

  return (
    <PortalShell>
      <PageHeader
        breadcrumb={
          <Link to={isHodView ? '/hod/tickets' : '/faculty/tickets'} className="hover:text-primary hover:underline">
            ← {isHodView ? 'All tickets' : 'Ticket queue'}
          </Link>
        }
        title={ticket.subject}
        subtitle={`${ticket.ticket_code} · raised by ${ticket.student?.full_name} on ${formatDateTime(ticket.created_at)}`}
        actions={
          canResolve && (
            <button type="button" className="btn-primary" onClick={() => setResolveOpen(true)} disabled={pending}>
              <span className="material-symbols-outlined text-[18px]">task_alt</span>
              Mark resolved
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TicketStatusBadge status={ticket.status} />
        <ResolutionBadge resolutionStatus={ticket.resolution_status} />
        <CategoryBadge category={ticket.category} />
        <PriorityBadge priority={ticket.priority} />
      </div>

      {ticket.resolution_status === 'reopened' && (
        <div className="mb-4 rounded-lg border-l-4 border-error bg-error-container/50 p-4">
          <p className="text-label-md text-on-surface">The student reopened this ticket</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {ticket.student_confirmation_comment || 'They reported the issue is not resolved.'}
          </p>
        </div>
      )}

      {ticket.resolution_status === 'pending_confirmation' && (
        <div className="mb-4 rounded-lg border-l-4 border-info bg-info-container/50 p-4">
          <p className="text-body-sm text-on-surface-variant">
            Waiting for {ticket.student?.full_name} to confirm the fix. The ticket closes once they answer yes.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel tab="Conversation" tabIcon="forum" className="lg:col-span-2" bodyClassName="">
          <div className="h-[600px]">
            <TicketConversation
              ticket={ticket}
              messages={messages}
              onPosted={reload}
              onOptimisticMessage={appendMessage}
              cannedReplies={cannedReplies}
              readOnly={ticket.resolution_status === 'confirmed'}
            />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel tab="Student" tabIcon="person">
            <dl className="space-y-3 text-body-sm">
              {[
                ['Name', ticket.student?.full_name],
                ['Registration no.', ticket.student?.login_id],
                ['Email', ticket.student?.email],
                ['Section', ticket.student?.section],
                ['Branch', ticket.student?.branch],
                ['Semester', ticket.student?.semester_label]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-label-sm uppercase tracking-wide text-tertiary">{label}</dt>
                  <dd className="mt-0.5 break-anywhere text-on-surface">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
            {!isHodView && ticket.student?.id && (
              <Link to={`/faculty/mentees/${ticket.student.id}`} className="btn-secondary btn-sm mt-4 w-full">
                Open mentee profile
              </Link>
            )}
          </Panel>

          <Panel tab="Ticket controls" tabIcon="tune">
            <SelectField
              label="Priority"
              name="priority"
              value={ticket.priority}
              onChange={(event) => changePriority(event.target.value)}
              options={TICKET_PRIORITIES}
              disabled={pending}
            />
            <dl className="mt-4 space-y-3 text-body-sm">
              {[
                ['First response', ticket.first_response_at ? formatDateTime(ticket.first_response_at) : 'Not yet'],
                ['Time to first response', formatHours(
                  ticket.first_response_at
                    ? (new Date(ticket.first_response_at) - new Date(ticket.created_at)) / 3600000
                    : 0
                )],
                ['Resolved on', ticket.resolved_at ? formatDateTime(ticket.resolved_at) : 'Not yet'],
                ['Times reopened', String(ticket.reopen_count ?? 0)],
                ['Student rating', ticket.satisfaction_rating ? `${ticket.satisfaction_rating}/5` : 'Not rated']
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-tertiary">{label}</dt>
                  <dd className="text-right text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onConfirm={resolve}
        pending={pending}
        title="Mark this ticket resolved?"
        confirmLabel="Mark resolved"
        message={`${ticket.student?.full_name} will be asked to confirm whether the issue is actually fixed. If they say no, the ticket reopens and comes back to you.`}
      />
    </PortalShell>
  );
}
