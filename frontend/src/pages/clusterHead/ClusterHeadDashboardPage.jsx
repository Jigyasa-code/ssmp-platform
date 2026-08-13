/**
 * ClusterHeadDashboardPage
 * Deliberately sparse. A Cluster Head's whole job is two kinds of upload,
 * so the home screen is their subject list, their recent uploads, and
 * shortcuts into the three upload screens. No tickets, no students, no
 * reports — none of that is theirs to see.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { SkeletonCards } from '../../components/ui/Skeleton.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { formatDateTime, describeError } from '../../lib/formatters.js';
import { ACADEMIC_UPLOAD_LABELS, sectionLabelsFor } from '../../lib/constants.js';

const SHORTCUTS = [
  { to: '/cluster-head/attendance', label: 'Upload attendance', icon: 'fact_check', tone: 'primary' },
  { to: '/cluster-head/gpa', label: 'Upload GPA', icon: 'grade', tone: 'info' },
  { to: '/cluster-head/backlogs', label: 'Upload backlogs', icon: 'assignment_late', tone: 'warning' }
];

export default function ClusterHeadDashboardPage() {
  const { profile } = useAuth();
  const toast = useToast();

  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [courseResult, batchResult] = await Promise.all([
      supabase
        .from('cluster_head_courses')
        .select('id, course_name, course_code, section_count')
        .order('display_order'),
      supabase
        .from('academic_upload_batches')
        .select('id, upload_type, section_label, period_start, period_end, semester_number, original_filename, total_rows, matched_rows, failed_rows, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    if (courseResult.error) toast.error(describeError(courseResult.error));
    if (batchResult.error) toast.error(describeError(batchResult.error));

    setCourses(courseResult.data ?? []);
    setBatches(batchResult.data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const totalSections = courses.reduce((sum, course) => sum + (course.section_count ?? 0), 0);
  const lastUpload = batches[0];

  return (
    <PortalShell>
      <PageHeader
        title={`Welcome, ${profile?.full_name?.split(' ')[0] ?? 'Cluster Head'}`}
        subtitle="Upload attendance and academic records for the subjects you handle. There is no fixed day for this — upload whenever the data is ready."
      />

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Subjects" value={courses.length} icon="menu_book" tone="primary" />
          <StatCard label="Sections in total" value={totalSections} icon="grid_view" tone="info" />
          <StatCard label="Uploads recorded" value={batches.length} icon="cloud_upload" tone="success" />
          <StatCard
            label="Last upload"
            value={lastUpload ? ACADEMIC_UPLOAD_LABELS[lastUpload.upload_type] ?? '—' : 'None yet'}
            caption={lastUpload ? formatDateTime(lastUpload.created_at) : 'Start with attendance'}
            icon="schedule"
            tone="slate"
          />
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {SHORTCUTS.map((shortcut) => (
          <Link
            key={shortcut.to}
            to={shortcut.to}
            className="panel flex items-center gap-3 p-5 transition-shadow hover:shadow-raised"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary">
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                {shortcut.icon}
              </span>
            </span>
            <span className="text-label-md text-on-surface">{shortcut.label}</span>
            <span className="material-symbols-outlined ml-auto text-[18px] text-tertiary" aria-hidden="true">
              chevron_right
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel tab="My subjects" tabIcon="menu_book" bodyClassName="">
          <DataTable
            columns={[
              { key: 'course_name', header: 'Course' },
              { key: 'course_code', header: 'Code' },
              {
                key: 'sections',
                header: 'Sections',
                render: (row) => sectionLabelsFor(row.section_count).join(', ')
              }
            ]}
            rows={courses}
            rowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon="menu_book"
                title="No subjects yet"
                description="Add your subjects from My Subjects to start uploading."
              />
            }
          />
        </Panel>

        <Panel tab="Recent uploads" tabIcon="history" bodyClassName="">
          <DataTable
            dense
            columns={[
              {
                key: 'upload_type',
                header: 'Type',
                render: (row) => ACADEMIC_UPLOAD_LABELS[row.upload_type] ?? row.upload_type
              },
              {
                key: 'scope',
                header: 'Scope',
                render: (row) =>
                  row.upload_type === 'attendance'
                    ? `Section ${row.section_label ?? '—'}`
                    : `Semester ${row.semester_number ?? '—'}`
              },
              { key: 'matched_rows', header: 'Recorded', align: 'right' },
              {
                key: 'failed_rows',
                header: 'Failed',
                align: 'right',
                render: (row) =>
                  row.failed_rows > 0 ? (
                    <span className="chip bg-error-container text-on-error-container">{row.failed_rows}</span>
                  ) : (
                    '—'
                  )
              },
              {
                key: 'created_at',
                header: 'When',
                render: (row) => formatDateTime(row.created_at)
              }
            ]}
            rows={batches}
            rowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon="cloud_upload"
                title="Nothing uploaded yet"
                description="Your uploads and any rows that could not be matched will appear here."
              />
            }
          />
        </Panel>
      </div>
    </PortalShell>
  );
}
