/**
 * AcademicUploadPanel
 * The shared upload block behind all three Cluster Head upload screens
 * (attendance, GPA, backlogs). Each page supplies its own filters above
 * the file picker; everything below — picking a file, posting it, showing
 * what matched and what did not — is identical, so it lives here once.
 *
 * NOTE ON TIMING
 * There is no date validation, no "you already uploaded this period"
 * warning and no disabled state tied to the calendar. Uploading early,
 * late, or twice in one afternoon is explicitly allowed.
 *
 * LARGE FILES
 * A roster of 2,700 students is 2,700 separate account creations, which
 * cannot finish inside one serverless request. The endpoint does as much
 * as it has time for and answers with the row it stopped at, so this
 * posts the same file again from there until there is nothing left, and
 * adds the numbers up as it goes.
 *
 * Endpoints that finish in one request — attendance, GPA, backlogs, the
 * mentor mapping — simply never send a next_offset, and the loop below
 * runs once.
 */

import { useState } from 'react';
import Panel from '../ui/Panel.jsx';
import DataTable from '../ui/DataTable.jsx';
import { FileField } from '../ui/FormControls.jsx';
import { apiClient } from '../../lib/apiClient.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';

/** Reads a File into base64 without the data: prefix. */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AcademicUploadPanel({
  title,
  tabIcon,
  hint,
  buildPayload,
  // Roster imports post somewhere else but do everything else the same
  // way — pick a file, send it, show what matched and what did not.
  endpoint = '/cluster-head/upload-academic-data',
  // The roster endpoint reports created/skipped/failed instead of
  // matched/failed, so each caller says what its own numbers mean.
  summarise = (data) => [
    { label: 'Rows in file', value: data.total_rows ?? 0 },
    { label: 'Recorded', value: data.matched ?? 0 },
    { label: 'Not matched', value: data.failed ?? 0 },
    { label: 'Students re-checked', value: data.students_reevaluated ?? 0 }
  ],
  disabled,
  disabledReason,
  submitLabel = 'Upload file',
  onUploaded,
  // Attendance also accepts the ERP's .xls export, which is really an HTML
  // table rather than a spreadsheet.
  accept = '.csv,.xlsx',
  placeholder = 'Choose a file (CSV or XLSX)'
}) {
  const { run, pending } = useAsyncAction();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);

  const submit = () =>
    run(
      async () => {
        if (!file) throw new Error('Choose a file first.');
        const base64 = await fileToBase64(file);
        const base = buildPayload({ filename: file.name, file_base64: base64 });

        const collected = { created: [], skipped: [], failed: [], row_errors: [] };
        let last = {};
        let total = 0;
        let batchId = null;
        let offset = 0;

        setProgress({ done: 0, total: 0 });
        for (;;) {
          // The first request is exactly what it always was, so an
          // endpoint that knows nothing about chunking is unaffected.
          const data = await apiClient.post(
            endpoint,
            offset === 0 ? base : { ...base, offset, batch_id: batchId }
          );
          last = data ?? {};
          batchId = last.batch_id ?? batchId;
          total = last.total_rows ?? total;
          for (const key of Object.keys(collected)) {
            if (Array.isArray(last[key])) collected[key].push(...last[key]);
          }
          setProgress({ done: last.processed_through ?? total, total });
          if (last.next_offset == null) break;
          offset = last.next_offset;
        }

        // Only the keys that really are lists get replaced by the running
        // total: the academic endpoints report `failed` as a count, and
        // overwriting that with an empty array would blank their summary.
        //
        // The two error lists are capped because they are rendered in a
        // table; created/skipped are not, because the credentials
        // download is built from created and must name every account.
        const capped = { failed: 200, row_errors: 200 };
        const merged = { ...last, total_rows: total, next_offset: null };
        for (const [key, rows] of Object.entries(collected)) {
          if (rows.length || Array.isArray(last[key])) {
            merged[key] = capped[key] ? rows.slice(0, capped[key]) : rows;
          }
        }
        return merged;
      },
      {
        successMessage: (data) =>
          data?.created
            ? `${data.created.length} account(s) created from ${data.total_rows} rows.`
            : 'Upload recorded.',
        onSuccess: (data) => {
          setResult(data ?? null);
          setFile(null);
          setProgress(null);
          onUploaded?.(data);
        },
        onError: () => setProgress(null)
      }
    );

  // Academic uploads report per-row problems as row_errors; the roster
  // endpoint calls the same thing failed. Same shape, same table.
  const errors = Array.isArray(result?.row_errors)
    ? result.row_errors
    : Array.isArray(result?.failed) ? result.failed : [];

  return (
    <>
      <Panel tab={title} tabIcon={tabIcon}>
        <div className="space-y-4">
          <FileField
            label="Data file"
            accept={accept}
            placeholder={placeholder}
            hint={hint}
            currentName={file?.name}
            onFileSelected={setFile}
            disabled={disabled || pending}
          />

          {disabled && disabledReason && (
            <p className="rounded-lg bg-warning-container/40 px-4 py-3 text-body-sm text-on-surface-variant">
              {disabledReason}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={submit}
              disabled={disabled || pending || !file}
            >
              <span className="material-symbols-outlined text-[18px]">upload</span>
              {pending ? 'Uploading...' : submitLabel}
            </button>
            {pending && progress?.total > 0 ? (
              <p className="text-label-sm text-on-surface-variant" role="status">
                {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows done — keep this
                tab open.
              </p>
            ) : (
              <p className="text-label-sm text-tertiary">
                You can upload on any day — there is no window you have to wait for.
              </p>
            )}
          </div>
        </div>
      </Panel>

      {result && (
        <Panel className="mt-4" tab="Last upload" tabIcon="task_alt">
          <div className="grid gap-3 sm:grid-cols-4">
            {summarise(result).map((item) => (
              <div key={item.label} className="rounded-xl bg-surface-container-low p-4">
                <p className="text-headline-sm text-on-surface">{item.value}</p>
                <p className="mt-1 text-label-sm uppercase tracking-wide text-tertiary">{item.label}</p>
              </div>
            ))}
          </div>

          {errors.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-label-md text-on-surface">Rows that could not be recorded</p>
              <DataTable
                dense
                columns={[
                  { key: 'row', header: 'Row', align: 'right' },
                  {
                    key: 'identifier',
                    header: 'Reg. no. / email',
                    render: (row) => row.identifier || row.email || '—'
                  },
                  { key: 'reason', header: 'Reason' }
                ]}
                rows={errors.map((error, index) => ({ ...error, key: `${error.row}-${index}` }))}
                rowKey={(row) => row.key}
              />
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
