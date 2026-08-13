/**
 * ClusterHeadBacklogPage
 * The six-monthly backlog upload. One row per backlog subject per student.
 *
 * A single uncleared backlog is enough to flag a student — that is the
 * rule as written, and it is why the file carries a Cleared column rather
 * than just a count: uploading a later file with Cleared = Yes is how a
 * backlog gets walked back and the flag lifts.
 */

import { useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { SelectField, TextField } from '../../components/ui/FormControls.jsx';
import AcademicUploadPanel from '../../components/clusterHead/AcademicUploadPanel.jsx';
import { SEMESTER_OPTIONS } from '../../lib/constants.js';

export default function ClusterHeadBacklogPage() {
  const [semester, setSemester] = useState('');
  const [examSession, setExamSession] = useState('');

  return (
    <PortalShell>
      <PageHeader
        title="Upload backlogs"
        subtitle="One row per backlog subject. Upload whenever results are published — there is no fixed date."
      />

      <Panel className="mb-4" tab="Which results?" tabIcon="tune">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Semester"
            name="semester"
            placeholder="Select a semester"
            required
            options={SEMESTER_OPTIONS}
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
          />
          <TextField
            label="Exam session"
            name="exam_session"
            placeholder="e.g. Even 2025-26"
            maxLength={60}
            value={examSession}
            onChange={(event) => setExamSession(event.target.value)}
            hint="Optional label for your own records"
          />
        </div>
      </Panel>

      <AcademicUploadPanel
        title="Backlog file"
        tabIcon="assignment_late"
        hint="CSV or XLSX. Columns: Reg No (or Email) and Subject Code. Optional: Subject Name, Cleared (Yes/No)."
        disabled={!semester}
        disabledReason="Choose a semester before uploading."
        submitLabel="Upload backlogs"
        buildPayload={({ filename, file_base64 }) => ({
          action: 'backlog',
          semester_number: Number(semester),
          exam_session: examSession.trim() || null,
          filename,
          file_base64
        })}
      />

      <Panel className="mt-4" tab="Clearing a backlog" tabIcon="info">
        <p className="text-body-sm text-on-surface-variant">
          To mark a backlog as cleared, upload the same student and subject code again with the Cleared
          column set to Yes. The student is re-checked straight away, and if that was the only reason
          they were flagged, the at-risk flag lifts and their mentor is told.
        </p>
      </Panel>
    </PortalShell>
  );
}
