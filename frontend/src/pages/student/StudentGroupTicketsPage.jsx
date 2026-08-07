/**
 * FEATURE 7 companion — the star mentee's read-only view of every ticket
 * raised inside their mentor group.
 *
 * Strictly view-only, and enforced in the database rather than here: the
 * get_mentor_group_tickets() function returns a narrow projection with no
 * ticket ids, no message bodies, no emails and no registration numbers, so
 * there is nothing to click through to. The representative can see what
 * their group is struggling with; they cannot reply, resolve, or open a
 * classmate's profile.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { SkeletonTable } from '../../components/ui/Skeleton.jsx';
import { SelectField } from '../../components/ui/FormControls.jsx';
import { TicketStatusBadge, CategoryBadge, PriorityBadge } from '../../components/ui/StatusBadge.jsx';
import { CategoryBarChart, DonutChart } from '../../components/charts/Charts.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { CHART_COLORS, TICKET_CATEGORIES, TICKET_STATUSES } from '../../lib/constants.js';
import { describeError, formatRelativeTime } from '../../lib/formatters.js';

export default function StudentGroupTicketsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('All');
  const [category, setCategory] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_mentor_group_tickets');
    if (error) toast.error(describeError(error));
    setTickets(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (profile?.is_star_mentee) load();
  }, [profile?.is_star_mentee, load]);

  // Live: a classmate raising a ticket shows up without a refresh.
  useEffect(() => {
    if (!profile?.is_star_mentee) return undefined;
    const channel = supabase
      .channel('group-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.is_star_mentee, load]);

  const filtered = useMemo(
    () =>
      tickets.filter(
        (t) => (status === 'All' || t.status === status) && (category === 'All' || t.category === category)
      ),
    [tickets, status, category]
  );

  const charts = useMemo(() => {
    const count = (key, value) => tickets.filter((t) => t[key] === value).length;
    return {
      category: TICKET_CATEGORIES.map((name, index) => ({
        name,
        value: count('category', name),
        color: [CHART_COLORS.academic, CHART_COLORS.erpTech, CHART_COLORS.infrastructure][index]
      })),
      status: [
        { name: 'Open', value: count('status', 'Open'), color: CHART_COLORS.open },
        { name: 'In Progress', value: count('status', 'In Progress'), color: CHART_COLORS.inProgress },
        { name: 'Resolved', value: count('status', 'Resolved'), color: CHART_COLORS.resolved }
      ]
    };
  }, [tickets]);

  // Not the representative (or no longer) — nothing to show.
  if (profile && !profile.is_star_mentee) return <Navigate to="/student" replace />;

  return (
    <PortalShell>
      <PageHeader
        title="Group tickets"
        subtitle={`Every ticket raised by students mentored by ${profile?.mentor?.full_name ?? 'your mentor'}. View-only.`}
      />

      <div className="mb-4 flex items-start gap-3 rounded-lg border-l-4 border-info bg-info-container/50 p-4">
        <span className="material-symbols-outlined text-[22px] text-info" aria-hidden="true">info</span>
        <p className="text-body-sm text-on-surface-variant">
          You can see this because your mentor made you the <strong>student representative</strong>. It is a
          read-only overview — you cannot reply to these tickets, resolve them, or open another student&apos;s
          profile.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tickets in the group" value={tickets.length} icon="groups" tone="primary" />
        <StatCard label="Open" value={charts.status[0].value} icon="pending" tone="error" />
        <StatCard label="In progress" value={charts.status[1].value} icon="autorenew" tone="warning" />
        <StatCard label="Resolved" value={charts.status[2].value} icon="task_alt" tone="success" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel tab="By category" tabIcon="bar_chart" className="lg:col-span-2">
          <CategoryBarChart data={charts.category} height={230} />
        </Panel>
        <Panel tab="By status" tabIcon="donut_small">
          <DonutChart data={charts.status} centerLabel="tickets" height={230} />
        </Panel>
      </div>

      <Panel tab="Filters" tabIcon="filter_alt" className="mt-4">
        <div className="flex flex-wrap items-end gap-4">
          <SelectField
            label="Status"
            className="w-full sm:w-56"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={['All', ...TICKET_STATUSES]}
          />
          <SelectField
            label="Category"
            className="w-full sm:w-56"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            options={['All', ...TICKET_CATEGORIES]}
          />
        </div>
      </Panel>

      {loading ? (
        <SkeletonTable rows={6} columns={6} />
      ) : (
        <Panel className="mt-4" bodyClassName="">
          <DataTable
            columns={[
              {
                key: 'ticket_code',
                header: 'Ref',
                render: (row) => <span className="font-semibold text-primary">{row.ticket_code}</span>
              },
              {
                key: 'subject',
                header: 'Subject',
                render: (row) => (
                  <span>
                    <span className="block text-on-surface">{row.subject}</span>
                    {row.is_mine && <span className="text-label-sm text-tertiary">raised by you</span>}
                  </span>
                )
              },
              {
                key: 'student_name',
                header: 'Student',
                render: (row) => (
                  <span>
                    <span className="block text-on-surface">{row.student_name}</span>
                    <span className="text-label-sm text-tertiary">Section {row.section ?? '—'}</span>
                  </span>
                )
              },
              { key: 'category', header: 'Category', render: (row) => <CategoryBadge category={row.category} /> },
              { key: 'priority', header: 'Priority', render: (row) => <PriorityBadge priority={row.priority} /> },
              { key: 'status', header: 'Status', render: (row) => <TicketStatusBadge status={row.status} /> },
              {
                key: 'last_message_at',
                header: 'Last update',
                render: (row) => <span className="text-tertiary">{formatRelativeTime(row.last_message_at)}</span>
              }
            ]}
            rows={filtered}
            rowKey={(row) => row.ticket_code}
            emptyState={
              <EmptyState
                icon="inbox"
                title={tickets.length ? 'Nothing matches these filters' : 'No tickets in your group yet'}
                description={
                  tickets.length
                    ? 'Try a different status or category.'
                    : 'When students in your mentor group raise tickets, they will appear here.'
                }
              />
            }
          />
        </Panel>
      )}
    </PortalShell>
  );
}
