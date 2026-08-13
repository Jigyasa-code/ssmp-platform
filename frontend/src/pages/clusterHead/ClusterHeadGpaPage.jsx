/**
 * ClusterHeadGpaPage
 * The six-monthly GPA upload. A figure uploaded here is the departmental
 * record: it overwrites whatever the student self-reported for that
 * semester, and from then on the student can no longer edit it (see
 * upsert_semester_gpa in migration 0021). That matters because GPA below 6
 * is one of the three at-risk conditions — a student should not be able to
 * edit away the reason they were flagged.
 */

import { useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { SelectField } from '../../components/ui/FormControls.jsx';
import AcademicUploadPanel from '../../components/clusterHead/AcademicUploadPanel.jsx';
import { SEMESTER_OPTIONS } from '../../lib/constants.js';

export default function ClusterHeadGpaPage() {
  const [semester, setSemester] = useState('');

  return (
    <PortalShell>
      <PageHeader
        title="Upload GPA"
        subtitle="Semester GPA for the students in your cluster. Usually done twice a year, but there is no restriction on when you upload."
      />

      <Panel className="mb-4" tab="Which semester?" tabIcon="tune">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Semester"
            name="semester"
            placeholder="Select a semester"
            required
            options={SEMESTER_OPTIONS}
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
            hint="One row per student for this semester"
          />
        </div>
      </Panel>

      <AcademicUploadPanel
        title="GPA file"
        tabIcon="grade"
        hint="CSV or XLSX. Columns: Reg No (or Email) and GPA. Values must be between 0 and 10."
        disabled={!semester}
        disabledReason="Choose a semester before uploading."
        submitLabel="Upload GPA"
        buildPayload={({ filename, file_base64 }) => ({
          action: 'gpa',
          semester_number: Number(semester),
          filename,
          file_base64
        })}
      />

      <Panel className="mt-4" tab="What happens next" tabIcon="info">
        <p className="text-body-sm text-on-surface-variant">
          Each student you upload is immediately re-checked against the at-risk rule — attendance below
          75%, GPA below 6, or any backlog on record. Anyone newly flagged has a meeting raised with
          their mentor as the organiser, and the mentor is notified. Uploading a corrected figure that
          clears the condition removes the flag just as quickly.
        </p>
      </Panel>
    </PortalShell>
  );
}
