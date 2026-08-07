import { useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { SkeletonTable } from '../../components/ui/Skeleton.jsx';
import { SelectField, Pagination } from '../../components/ui/FormControls.jsx';
import { TicketStatusBadge, CategoryBadge, PriorityBadge, ResolutionBadge } from '../../components/ui/StatusBadge.jsx';
import { useRealtimeTickets } from '../../hooks/useRealtimeTickets.js';
import { formatRelativeTime } from '../../lib/formatters.js';
import { TICKET_CATEGORIES, TICKET_STATUSES } from '../../lib/constants.js';

export default function FacultyTicketQueuePage({ isHodView = false }) {
  const [status, setStatus] = useState('All');
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const { tickets, loading, page, setPage, pageCount, total } = useRealtimeTickets({ status, category, search });

  const basePath = isHodView ? '/hod/tickets' : '/faculty/tickets';

  const columns = [
    { key: 'ticket_code', header: 'Ref', render: (row) => <span className="font-semibold text-primary">{row.ticket_code}</span> },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <Link to={`${basePath}/${row.id}`} className="text-on-surface hover:text-primary hover:underline">
          {row.subject}
        </Link>
      )
    },
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <span>
          <span className="block text-on-surface">{row.student?.full_name ?? '—'}</span>
          <span className="text-label-sm text-tertiary">{row.student?.login_id ?? ''}</span>
        </span>
      )
    },
    ...(isHodView
      ? [{ key: 'mentor', header: 'Mentor', render: (row) => row.mentor?.full_name ?? '—' }]
      : []),
    { key: 'category', header: 'Category', render: (row) => <CategoryBadge category={row.category} /> },
    { key: 'priority', header: 'Priority', render: (row) => <PriorityBadge priority={row.priority} /> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <TicketStatusBadge status={row.status} />
          <ResolutionBadge resolutionStatus={row.resolution_status} />
        </span>
      )
    },
    {
      key: 'last_message_at',
      header: 'Last update',
      render: (row) => <span className="text-tertiary">{formatRelativeTime(row.last_message_at)}</span>
    }
  ];

  return (
    <PortalShell searchPlaceholder="Search tickets by subject or reference..." onSearch={setSearch}>
      <PageHeader
        title={isHodView ? 'All tickets' : 'Ticket queue'}
        subtitle={
          isHodView
            ? 'Department-wide view of every support ticket, across all mentors.'
            : 'Tickets raised by your mentees. Updates arrive live — no need to refresh.'
        }
      />

      <Panel tab="Filters" tabIcon="filter_alt" className="mb-4">
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
          {(status !== 'All' || category !== 'All') && (
            <button
              type="button"
              className="btn-ghost btn-sm mb-0.5"
              onClick={() => {
                setStatus('All');
                setCategory('All');
              }}
            >
              <span className="material-symbols-outlined text-[17px]">filter_alt_off</span>
              Clear filters
            </button>
          )}
        </div>
      </Panel>

      {loading ? (
        <SkeletonTable rows={8} columns={7} />
      ) : (
        <Panel bodyClassName="">
          <DataTable
            columns={columns}
            rows={tickets}
            rowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon="inbox"
                title="No tickets here"
                description="Nothing matches these filters right now."
                action={
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setStatus('All');
                      setCategory('All');
                    }}
                  >
                    Clear filters
                  </button>
                }
              />
            }
            footer={<Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} />}
          />
        </Panel>
      )}
    </PortalShell>
  );
}
