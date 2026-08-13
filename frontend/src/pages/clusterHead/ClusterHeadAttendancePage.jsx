/**
 * ClusterHeadAttendancePage
 *
 * Course dropdown comes from the setup form; the Section dropdown is built
 * from that course's section_count, so a course entered as "2 sections"
 * offers A and B and nothing else.
 *
 * THE FIRST UPLOAD IS THE MAPPING
 * There is no separate screen for saying which student sits in which
 * section. The first attendance file for a (course, section) pair is what
 * teaches the portal that mapping — record_attendance_batch() upserts
 * student_course_sections as it goes.
 *
 * THE DATE FIELDS ARE A LABEL, NOT A GATE
 * period_start / period_end describe which fortnight the numbers cover.
 * They do not restrict when the upload may happen: an upload on the 3rd
 * for a period ending the 15th is fine, as is one three weeks late.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { SelectField, TextField } from '../../components/ui/FormControls.jsx';
import AcademicUploadPanel from '../../components/clusterHead/AcademicUploadPanel.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { describeError } from '../../lib/formatters.js';
import { sectionLabelsFor } from '../../lib/constants.js';

/** Default window: the fortnight ending today. Editable, never enforced. */
function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 14);
  const iso = (date) => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export default function ClusterHeadAttendancePage() {
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [courseId, setCourseId] = useState('');
  const [section, setSection] = useState('');
  const [period, setPeriod] = useState(defaultPeriod);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('cluster_head_courses')
      .select('id, course_name, course_code, section_count')
      .order('display_order');
    if (error) toast.error(describeError(error));
    setCourses(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId),
    [courses, courseId]
  );

  const sections = selectedCourse ? sectionLabelsFor(selectedCourse.section_count) : [];

  // Changing course invalidates the section — B may not exist on the new one.
  const onCourseChange = (value) => {
    setCourseId(value);
    setSection('');
  };

  const ready = Boolean(courseId && section && period.start && period.end);

  return (
    <PortalShell>
      <PageHeader
        title="Upload attendance"
        subtitle="Pick the course and section, say which period the numbers cover, then upload the file. You can do this on any day — early or late makes no difference."
      />

      {!loading && !courses.length ? (
        <Panel>
          <EmptyState
            icon="menu_book"
            title="No subjects set up"
            description="Add your subjects first — the Course and Section dropdowns are built from them."
          />
        </Panel>
      ) : (
        <>
          <Panel className="mb-4" tab="What are you uploading?" tabIcon="tune">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SelectField
                label="Course name"
                name="course"
                placeholder="Select a course"
                required
                options={courses.map((course) => ({
                  value: course.id,
                  label: `${course.course_name} (${course.course_code})`
                }))}
                value={courseId}
                onChange={(event) => onCourseChange(event.target.value)}
              />
              <SelectField
                label="Section"
                name="section"
                placeholder={courseId ? 'Select a section' : 'Pick a course first'}
                required
                disabled={!courseId}
                options={sections}
                value={section}
                onChange={(event) => setSection(event.target.value)}
                hint={
                  selectedCourse
                    ? `${selectedCourse.course_name} runs ${selectedCourse.section_count} section(s)`
                    : undefined
                }
              />
              <TextField
                label="Period from"
                name="period_start"
                type="date"
                required
                value={period.start}
                onChange={(event) => setPeriod((p) => ({ ...p, start: event.target.value }))}
              />
              <TextField
                label="Period to"
                name="period_end"
                type="date"
                required
                value={period.end}
                onChange={(event) => setPeriod((p) => ({ ...p, end: event.target.value }))}
                hint="Describes the data, not the upload date"
              />
            </div>
          </Panel>

          <AcademicUploadPanel
            title="Attendance file"
            tabIcon="fact_check"
            hint="CSV or XLSX. Columns: Reg No (or Email) plus Classes Held and Classes Attended. An Attendance % column also works."
            disabled={!ready}
            disabledReason="Choose a course, a section and the reporting period before uploading."
            submitLabel="Upload attendance"
            buildPayload={({ filename, file_base64 }) => ({
              action: 'attendance',
              course_id: courseId,
              section,
              period_start: period.start,
              period_end: period.end,
              filename,
              file_base64
            })}
          />

          <Panel className="mt-4" tab="How the section mapping works" tabIcon="info">
            <p className="text-body-sm text-on-surface-variant">
              There is no separate step for recording which student belongs to which section. The first
              attendance file you upload for a course and section is what establishes that mapping, and
              later uploads keep it current. Students whose registration number or email does not match
              anyone are listed back to you rather than silently dropped.
            </p>
          </Panel>
        </>
      )}
    </PortalShell>
  );
}
