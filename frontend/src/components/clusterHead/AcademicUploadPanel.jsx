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
  disabled,
  disabledReason,
  submitLabel = 'Upload file',
  onUploaded
}) {
  const { run, pending } = useAsyncAction();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  const submit = () =>
    run(
      async () => {
        if (!file) throw new Error('Choose a file first.');
        const base64 = await fileToBase64(file);
        const payload = buildPayload({ filename: file.name, file_base64: base64 });
        return apiClient.post('/cluster-head/upload-academic-data', payload);
      },
      {
        successMessage: 'Upload recorded.',
        onSuccess: (data) => {
          setResult(data ?? null);
          setFile(null);
          onUploaded?.(data);
        }
      }
    );

  const errors = Array.isArray(result?.row_errors) ? result.row_errors : [];

  return (
    <>
      <Panel tab={title} tabIcon={tabIcon}>
        <div className="space-y-4">
          <FileField
            label="Data file"
            accept=".csv,.xlsx"
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
            <p className="text-label-sm text-tertiary">
              You can upload on any day — there is no window you have to wait for.
            </p>
          </div>
        </div>
      </Panel>

      {result && (
        <Panel className="mt-4" tab="Last upload" tabIcon="task_alt">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: 'Rows in file', value: result.total_rows ?? 0 },
              { label: 'Recorded', value: result.matched ?? 0 },
              { label: 'Not matched', value: result.failed ?? 0 },
              { label: 'Students re-checked', value: result.students_reevaluated ?? 0 }
            ].map((item) => (
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
                  { key: 'identifier', header: 'Reg. no. / email' },
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
