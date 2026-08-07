import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { SelectField, TextAreaField } from '../../components/ui/FormControls.jsx';
import { TicketStatusBadge, CategoryBadge, PriorityBadge, ResolutionBadge } from '../../components/ui/StatusBadge.jsx';
import TicketConversation from '../../components/tickets/TicketConversation.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useTicketThread } from '../../hooks/useRealtimeTickets.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { formatDateTime, formatHours } from '../../lib/formatters.js';
import { TICKET_PRIORITIES } from '../../lib/constants.js';

/** Must match max_resolution_rejections() in migration 0018. */
const MAX_REJECTIONS = 3;

export default function FacultyTicketDetailPage({ isHodView = false }) {
  const { ticketId } = useParams();
  const { ticket, messages, loading, error, reload, appendMessage } = useTicketThread(ticketId);
  const { run, pending } = useAsyncAction();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalationNote, setEscalationNote] = useState('');
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

  /**
   * After 3 rejections the mentor can hand the disagreement to the HOD
   * rather than keep re-resolving a ticket the student will not accept.
   */
  const escalate = () =>
    run(
      async () => {
        const { error: rpcError } = await supabase.rpc('escalate_ticket_to_hod', {
          p_ticket_id: ticket.id,
          p_note: escalationNote.trim() || null
        });
        if (rpcError) throw rpcError;
      },
      {
        successMessage: 'Referred to the HOD. The student has been told too.',
        onSuccess: () => {
          setEscalateOpen(false);
          setEscalationNote('');
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
          <p className="text-label-md text-on-surface">
            The student reopened this ticket
            {ticket.reopen_count > 1 ? ` (${ticket.reopen_count} times)` : ''}
          </p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {ticket.student_confirmation_comment || 'They reported the issue is not resolved.'}
          </p>
        </div>
      )}

      {ticket.reopen_count >= MAX_REJECTIONS && !ticket.escalated_to_hod && (
        <div className="mb-4 rounded-lg border-l-4 border-warning bg-warning-container/50 p-4">
          <p className="text-label-md text-on-surface">
            This ticket has been rejected {ticket.reopen_count} times
          </p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            The student cannot reject it again. If you believe the issue is resolved, refer it to the Head of
            Department — they will review the thread and decide.
          </p>
          <button type="button" className="btn-primary btn-sm mt-3" onClick={() => setEscalateOpen(true)}>
            <span className="material-symbols-outlined text-[17px]">flag</span>
            Report to HOD
          </button>
        </div>
      )}

      {ticket.escalated_to_hod && (
        <div className="mb-4 rounded-lg border-l-4 border-info bg-info-container/50 p-4">
          <p className="text-label-md text-on-surface">Referred to the Head of Department</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Sent on {formatDateTime(ticket.escalated_at)}.
            {ticket.escalation_note ? ` Note: ${ticket.escalation_note}` : ''}
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

      <Modal
        open={escalateOpen}
        onClose={() => setEscalateOpen(false)}
        size="sm"
        title="Refer this ticket to the HOD?"
        description={`${ticket.student?.full_name} has rejected the resolution ${ticket.reopen_count} times.`}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setEscalateOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={escalate} disabled={pending}>
              {pending ? 'Sending...' : 'Refer to HOD'}
            </button>
          </>
        }
      >
        <TextAreaField
          label="What should the HOD know?"
          rows={4}
          maxLength={1000}
          value={escalationNote}
          onChange={(event) => setEscalationNote(event.target.value)}
          placeholder="e.g. The ERP password was reset and verified working on 6 August; the student still reports it is broken."
          hint="This is sent to every HOD along with the ticket. The student is told the ticket was referred, but not shown this note."
        />
      </Modal>

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
