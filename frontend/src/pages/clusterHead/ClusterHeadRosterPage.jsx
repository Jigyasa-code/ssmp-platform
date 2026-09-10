/**
 * ClusterHeadRosterPage
 * Student roster · faculty roster · mentor–mentee mapping, in that order,
 * because that is the order they have to happen in: a student cannot be
 * mapped to a mentor who has no account, and a mentor cannot be mapped to
 * a student who has no account.
 *
 * Moved here from the HOD's Semester setup screen — the Cluster Head is
 * the one holding these files. The endpoint is unchanged and still runs
 * on the service role; only who may call it moved.
 *
 * One page rather than three: the three uploads share a prerequisite
 * chain, and splitting them across three routes would hide it.
 */

import { useCallback, useEffect, useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import AcademicUploadPanel from '../../components/clusterHead/AcademicUploadPanel.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { describeError, formatDateTime } from '../../lib/formatters.js';

/** created/skipped/failed, which is what the roster endpoint reports. */
const rosterSummary = (data) => [
  { label: 'Rows in file', value: data.total_rows ?? 0 },
  { label: 'Accounts created', value: data.created?.length ?? 0 },
  { label: 'Already existed', value: data.skipped?.length ?? 0 },
  { label: 'Problems', value: data.failed?.length ?? 0 }
];

const mentorSummary = (data) => [
  { label: 'Rows in file', value: data.total_rows ?? 0 },
  { label: 'Mapped', value: data.matched ?? 0 },
  { label: 'Already correct', value: data.unchanged ?? 0 },
  { label: 'Problems', value: data.failed ?? 0 }
];

export default function ClusterHeadRosterPage() {
  const toast = useToast();
  const [batches, setBatches] = useState([]);
  const [credentials, setCredentials] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('roster_import_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(15);
    if (error) toast.error(describeError(error));
    setBatches(data ?? []);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Temporary passwords are returned once and never again — losing this
   * download means every account has to be reset by hand, so it is
   * offered the moment an import finishes.
   */
  const onRosterUploaded = (data) => {
    load();
    if (data?.created?.length) setCredentials(data.created);
  };

  const downloadCredentials = () => {
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
      'Name,Email,Login ID,Temporary Password',
      ...credentials.map((row) =>
        [row.full_name, row.email, row.login_id, row.temporary_password].map(escape).join(',')
      )
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `smp-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  return (
    <PortalShell>
      <PageHeader
        title="Rosters and mentors"
        subtitle="Create accounts from the departmental spreadsheets, then map each student to their allotted mentor."
      />

      {credentials && (
        <Panel className="mb-4" tab="Credentials — download this now" tabIcon="key">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-on-surface-variant">
              {credentials.length} account{credentials.length === 1 ? '' : 's'} created. Temporary passwords
              are shown only in this download; every account is forced to set a new password at first
              sign-in.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={downloadCredentials}>
                <span className="material-symbols-outlined text-[18px]">download</span>
                Download CSV
              </button>
              <button type="button" className="btn-ghost" onClick={() => setCredentials(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* 1 — students. Accounts are created against the Email Id column,
             which is what they then sign in with. */}
      <AcademicUploadPanel
        title="1 · Student roster"
        tabIcon="school"
        endpoint="/admin/import-roster-spreadsheet"
        summarise={rosterSummary}
        hint="CSV or XLSX. Columns: Registration No, Student Name, Email Id. Optional: Section, Semester, Program Name, Mobile Number, Father's Name / Number / Email."
        submitLabel="Create student accounts"
        buildPayload={({ filename, file_base64 }) => ({
          import_type: 'student',
          create_accounts: true,
          filename,
          file_base64
        })}
        onUploaded={onRosterUploaded}
      />

      <div className="mt-4">
        <AcademicUploadPanel
          title="2 · Faculty roster"
          tabIcon="badge"
          endpoint="/admin/import-roster-spreadsheet"
          summarise={rosterSummary}
          hint="CSV or XLSX. Columns: Faculty ID, Name, Email. Optional: Department, Password."
          submitLabel="Create faculty accounts"
          buildPayload={({ filename, file_base64 }) => ({
            import_type: 'faculty',
            create_accounts: true,
            filename,
            file_base64
          })}
          onUploaded={onRosterUploaded}
        />
      </div>

      {/* 3 — the mapping. Deliberately last: it matches on existing
             accounts and reports anything it cannot find, rather than
             creating either side silently. */}
      <div className="mt-4">
        <AcademicUploadPanel
          title="3 · Mentor–mentee mapping"
          tabIcon="supervisor_account"
          summarise={mentorSummary}
          hint="CSV or XLSX. Columns: Registration No. and Mentor Email. The Mentor Phone No. column is ignored."
          submitLabel="Map students to mentors"
          buildPayload={({ filename, file_base64 }) => ({
            action: 'mentor-map',
            filename,
            file_base64
          })}
        />
      </div>

      <Panel className="mt-4" tab="How the three fit together" tabIcon="info">
        <ul className="space-y-2 text-body-sm text-on-surface-variant">
          <li>
            <strong className="text-on-surface">Order matters.</strong> The mapping matches on accounts
            that already exist, so upload both rosters before it. A row it cannot match is listed back to
            you with the reason rather than being skipped silently.
          </li>
          <li>
            <strong className="text-on-surface">Students sign in with their Email Id</strong> from the
            roster, using the temporary password in the download above.
          </li>
          <li>
            <strong className="text-on-surface">Re-uploading is safe.</strong> An email that already has
            an account is reported as &ldquo;already existed&rdquo; and left alone; re-running the mapping
            only touches students whose mentor actually changed.
          </li>
          <li>
            <strong className="text-on-surface">Changing a mentor notifies everyone.</strong> The student,
            the outgoing mentor and the incoming one are all told, and the move is written to the
            reassignment log.
          </li>
        </ul>
      </Panel>

      <Panel className="mt-4" tab="Import history" tabIcon="history" bodyClassName="">
        <DataTable
          dense
          columns={[
            { key: 'created_at', header: 'When', render: (row) => formatDateTime(row.created_at) },
            { key: 'import_type', header: 'Type' },
            { key: 'original_filename', header: 'File' },
            { key: 'total_rows', header: 'Rows', align: 'right' },
            { key: 'created_count', header: 'Created', align: 'right' },
            { key: 'skipped_count', header: 'Skipped', align: 'right' },
            {
              key: 'failed_count',
              header: 'Failed',
              align: 'right',
              render: (row) => (
                <span className={row.failed_count > 0 ? 'text-error' : ''}>{row.failed_count}</span>
              )
            }
          ]}
          rows={batches}
          rowKey={(row) => row.id}
          emptyState={
            <EmptyState
              icon="upload_file"
              title="No roster imports yet"
              description="Start with the student roster above."
            />
          }
        />
      </Panel>
    </PortalShell>
  );
}
