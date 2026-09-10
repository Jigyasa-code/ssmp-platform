/**
 * StudentCounsellingPage
 * Write something, it goes to your assigned mentor. Nobody else can read
 * it — not the HOD, not the star mentee (see migration 0029).
 */

import { useCallback, useEffect, useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { SkeletonCards } from '../../components/ui/Skeleton.jsx';
import { TextAreaField } from '../../components/ui/FormControls.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { COUNSELLING_STATUS } from '../../lib/constants.js';
import { describeError, formatDateTime } from '../../lib/formatters.js';

export default function StudentCounsellingPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { run, pending } = useAsyncAction();

  const [concern, setConcern] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('counselling_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error(describeError(error));
    setRequests(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = (event) => {
    event.preventDefault();
    if (!concern.trim()) {
      toast.error('Write down what you would like to talk about.');
      return;
    }
    run(
      async () => {
        const { error } = await supabase.rpc('request_counselling', { p_concern: concern.trim() });
        if (error) throw error;
      },
      {
        successMessage: `Sent to ${profile?.mentor?.full_name ?? 'your mentor'}.`,
        onSuccess: () => {
          setConcern('');
          load();
        }
      }
    );
  };

  return (
    <PortalShell>
      <PageHeader
        title="Counselling"
        subtitle="Tell your mentor what is on your mind. This goes only to them."
      />

      <div className="mb-4 flex items-start gap-3 rounded-lg border-l-4 border-info bg-info-container/50 p-4">
        <span className="material-symbols-outlined text-[22px] text-info" aria-hidden="true">lock</span>
        <p className="text-body-sm text-on-surface-variant">
          Only <strong>{profile?.mentor?.full_name ?? 'your assigned mentor'}</strong> can read this. It does
          not appear in your ticket list, on the department dashboards, or in any report. If it is urgent and
          you need someone now, please speak to the department office directly.
        </p>
      </div>

      <Panel tab="What would you like to talk about?" tabIcon="volunteer_activism">
        {profile?.assigned_mentor_id ? (
          <form onSubmit={submit}>
            <TextAreaField
              label="Your concern"
              name="concern"
              required
              rows={6}
              maxLength={3000}
              value={concern}
              onChange={(event) => setConcern(event.target.value)}
              hint="Academic pressure, attendance, something at home, anything else — in your own words."
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-label-sm text-tertiary">{concern.length}/3000</p>
              <button type="submit" className="btn-primary ml-auto" disabled={pending || !concern.trim()}>
                {pending ? 'Sending...' : 'Send to my mentor'}
              </button>
            </div>
          </form>
        ) : (
          <EmptyState
            icon="person_off"
            title="No mentor assigned yet"
            description="Counselling requests go to your assigned mentor. Please contact the HOD office so one can be assigned."
          />
        )}
      </Panel>

      <h2 className="mb-3 mt-6 text-headline-sm text-on-surface">What you have sent</h2>

      {loading ? (
        <SkeletonCards count={2} />
      ) : requests.length === 0 ? (
        <Panel>
          <EmptyState
            icon="forum"
            title="Nothing sent yet"
            description="Anything you send appears here, along with your mentor's reply."
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const status = COUNSELLING_STATUS[request.status] ?? COUNSELLING_STATUS.open;
            return (
              <Panel
                key={request.id}
                tab={formatDateTime(request.created_at)}
                tabIcon="chat_bubble"
                actions={<span className={`chip ${status.className}`}>{status.studentLabel}</span>}
              >
                <p className="whitespace-pre-wrap text-body-sm text-on-surface">{request.concern}</p>

                {request.mentor_note && (
                  <div className="mt-4 rounded-lg border-l-4 border-primary bg-primary-fixed/40 p-4">
                    <p className="text-label-sm uppercase tracking-wide text-on-primary-fixed-variant">
                      Reply from {profile?.mentor?.full_name ?? 'your mentor'} ·{' '}
                      {formatDateTime(request.responded_at)}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-body-sm text-on-surface">
                      {request.mentor_note}
                    </p>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
