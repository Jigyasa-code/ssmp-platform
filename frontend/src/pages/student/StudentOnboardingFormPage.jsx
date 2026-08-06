/**
 * FEATURE 1 — Student onboarding, Form A
 * Digitised from the Mentor-Mentee Scheme Form-A (Dept. of IoT & IS),
 * grouped exactly as the paper form is: Student Details / MUJ Alumni /
 * Parents / Address / Uploads.
 *
 * The form is one-time: once submitted it becomes read-only, and only the
 * HOD can unlock it for correction.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import {
  TextField, TextAreaField, SelectField, RadioGroupField, CheckboxField, FileField
} from '../../components/ui/FormControls.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { uploadPrivateFile, BUCKETS } from '../../lib/fileUpload.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { BLOOD_GROUPS, PARENT_OCCUPATIONS } from '../../lib/constants.js';
import { describeError, formatDateTime } from '../../lib/formatters.js';

const EMPTY_FORM = {
  full_name: '', registration_no: '', section: '', roll_no: '', branch: '',
  mobile_no: '', email: '', hostel_block: '', room_no: '', blood_group: '',
  date_of_birth: '', is_day_scholar: false,
  has_muj_alumni_in_family: false, alumni_name: '', alumni_branch: '',
  alumni_batch: '', alumni_institution: '', alumni_relationship: '',
  father_name: '', father_occupation: '', father_organization: '', father_designation: '',
  father_mobile: '', father_email: '',
  mother_name: '', mother_occupation: '', mother_organization: '', mother_designation: '',
  mother_mobile: '', mother_email: '',
  communication_address: '', communication_pin_code: '',
  permanent_same_as_communication: false, permanent_address: '', permanent_pin_code: '',
  parent_business_card_path: '', student_signature_path: ''
};

function validate(form) {
  const errors = {};
  const required = (key, message) => {
    if (!String(form[key] ?? '').trim()) errors[key] = message;
  };

  required('full_name', 'Your full name is required.');
  required('registration_no', 'Registration number is required.');
  required('father_name', "Father's name is required.");
  required('mother_name', "Mother's name is required.");
  required('communication_address', 'Address for communication is required.');

  if (!/^[0-9]{10}$/.test(form.mobile_no)) errors.mobile_no = 'Enter a 10-digit mobile number.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errors.email = 'Enter a valid email address.';
  if (!/^[0-9]{6}$/.test(form.communication_pin_code)) errors.communication_pin_code = 'Enter a 6-digit pin code.';

  if (!form.permanent_same_as_communication) {
    if (!form.permanent_address.trim()) errors.permanent_address = 'Permanent address is required.';
    if (!/^[0-9]{6}$/.test(form.permanent_pin_code)) errors.permanent_pin_code = 'Enter a 6-digit pin code.';
  }
  if (!form.is_day_scholar && !form.hostel_block.trim()) {
    errors.hostel_block = 'Hostel block is required (or tick "I am a day scholar").';
  }
  if (form.has_muj_alumni_in_family && !form.alumni_name.trim()) {
    errors.alumni_name = 'Please give the name of your relative who studied at MUJ.';
  }
  for (const key of ['father_mobile', 'mother_mobile']) {
    if (form[key] && !/^[0-9]{10}$/.test(form[key])) errors[key] = 'Enter a 10-digit mobile number.';
  }
  for (const key of ['father_email', 'mother_email']) {
    if (form[key] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form[key])) errors[key] = 'Enter a valid email address.';
  }
  if (form.date_of_birth) {
    const dob = new Date(form.date_of_birth);
    if (dob >= new Date()) errors.date_of_birth = 'Date of birth must be in the past.';
  }
  return errors;
}

export default function StudentOnboardingFormPage() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { run, pending } = useAsyncAction();

  const [form, setForm] = useState(EMPTY_FORM);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploads, setUploads] = useState({ businessCard: '', signature: '' });
  const [uploading, setUploading] = useState(null);

  const locked = Boolean(existing?.is_locked);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('student_form_a_profiles')
      .select('*')
      .eq('student_id', profile.id)
      .maybeSingle();

    if (error) toast.error(describeError(error));

    if (data) {
      setExisting(data);
      setForm({
        ...EMPTY_FORM,
        ...Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, data[key] ?? EMPTY_FORM[key]]))
      });
    } else {
      // Pre-fill what the department already knows about this student.
      setForm((current) => ({
        ...current,
        full_name: profile.full_name ?? '',
        registration_no: profile.login_id ?? '',
        email: profile.email ?? '',
        branch: profile.branch ?? '',
        section: profile.section ?? '',
        mobile_no: profile.phone ?? ''
      }));
    }
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key) => (value) =>
    setForm((current) => ({ ...current, [key]: value?.target ? value.target.value : value }));

  const handleUpload = async (kind, file) => {
    setUploading(kind);
    try {
      const path = await uploadPrivateFile(
        BUCKETS.FORM_A,
        profile.id,
        file,
        kind === 'businessCard' ? 'parent-business-card' : 'student-signature'
      );
      setForm((current) => ({
        ...current,
        [kind === 'businessCard' ? 'parent_business_card_path' : 'student_signature_path']: path
      }));
      setUploads((current) => ({ ...current, [kind]: file.name }));
      toast.success('File uploaded.');
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setUploading(null);
    }
  };

  const openConfirm = (event) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error('Please fix the highlighted fields before submitting.');
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setConfirmOpen(true);
  };

  const submit = () =>
    run(
      async () => {
        const payload = { ...form };
        if (payload.permanent_same_as_communication) {
          payload.permanent_address = payload.communication_address;
          payload.permanent_pin_code = payload.communication_pin_code;
        }
        if (!payload.date_of_birth) payload.date_of_birth = null;
        const { error } = await supabase.rpc('submit_student_form_a', { p_payload: payload });
        if (error) throw error;
      },
      {
        successMessage: 'Form A submitted. Welcome to the portal!',
        onSuccess: async () => {
          setConfirmOpen(false);
          await refreshProfile();
          navigate('/student', { replace: true });
        }
      }
    );

  const requestUnlock = () =>
    run(
      async () => {
        const { error } = await supabase.rpc('request_form_a_unlock');
        if (error) throw error;
      },
      { successMessage: 'Unlock request sent to your HOD.', onSuccess: load }
    );

  const fieldProps = useMemo(
    () => (key) => ({
      name: key,
      value: form[key] ?? '',
      onChange: update(key),
      error: errors[key],
      disabled: locked
    }),
    [form, errors, locked]
  );

  if (loading) return <PortalShell><PageLoader label="Loading Form A..." /></PortalShell>;

  return (
    <PortalShell>
      <PageHeader
        title="Form A — Mentor-Mentee Scheme"
        subtitle="A one-time departmental record. Please fill it in carefully; it becomes read-only once submitted."
        actions={
          locked ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={requestUnlock}
              disabled={pending || existing?.unlock_requested}
            >
              <span className="material-symbols-outlined text-[18px]">lock_open</span>
              {existing?.unlock_requested ? 'Unlock requested' : 'Request unlock'}
            </button>
          ) : null
        }
      />

      {locked && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border-l-4 border-success bg-success-container/50 p-4">
          <span className="material-symbols-outlined text-[22px] text-success" aria-hidden="true">verified</span>
          <div>
            <p className="text-label-md text-on-surface">Submitted on {formatDateTime(existing.submitted_at)}</p>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              This form is now read-only. If something needs correcting, request an unlock and your HOD will reopen it.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={openConfirm} className="space-y-5">
        {/* ── Student details ─────────────────────────────────────────── */}
        <Panel tab="Student Details" tabIcon="person">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Name" required {...fieldProps('full_name')} />
            <TextField label="Registration no." required {...fieldProps('registration_no')} />
            <TextField label="Roll no." {...fieldProps('roll_no')} />
            <TextField label="Section" {...fieldProps('section')} />
            <TextField label="Branch" {...fieldProps('branch')} />
            <TextField label="Mobile no." required inputMode="numeric" maxLength={10} {...fieldProps('mobile_no')} />
            <TextField label="Email ID" type="email" required {...fieldProps('email')} />
            <TextField label="Date of birth" type="date" {...fieldProps('date_of_birth')} />
            <SelectField label="Blood group" placeholder="Select" options={BLOOD_GROUPS} {...fieldProps('blood_group')} />
          </div>

          <div className="mt-4 border-t border-surface-container pt-4">
            <CheckboxField
              label="I am a day scholar (I do not stay in a hostel)"
              checked={form.is_day_scholar}
              onChange={update('is_day_scholar')}
              disabled={locked}
            />
            {!form.is_day_scholar && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField label="Hostel block no." required {...fieldProps('hostel_block')} />
                <TextField label="Room no." {...fieldProps('room_no')} />
              </div>
            )}
          </div>
        </Panel>

        {/* ── MUJ alumni ──────────────────────────────────────────────── */}
        <Panel tab="MUJ Alumni in Family" tabIcon="diversity_3">
          <RadioGroupField
            label="Any MUJ alumni in your family?"
            name="has_muj_alumni_in_family"
            columns={2}
            value={form.has_muj_alumni_in_family ? 'yes' : 'no'}
            onChange={(value) => update('has_muj_alumni_in_family')(value === 'yes')}
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' }
            ]}
          />
          {form.has_muj_alumni_in_family && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField label="Name" required {...fieldProps('alumni_name')} />
              <TextField label="Branch" {...fieldProps('alumni_branch')} />
              <TextField label="Batch" placeholder="e.g. 2018-22" {...fieldProps('alumni_batch')} />
              <TextField label="Institution" {...fieldProps('alumni_institution')} />
              <TextField label="Relationship" placeholder="e.g. Elder brother" {...fieldProps('alumni_relationship')} />
            </div>
          )}
        </Panel>

        {/* ── Parents ─────────────────────────────────────────────────── */}
        <Panel tab="Details of the Parents" tabIcon="family_restroom">
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { prefix: 'father', title: "Father's details" },
              { prefix: 'mother', title: "Mother's details" }
            ].map(({ prefix, title }) => (
              <div key={prefix} className="rounded-lg border border-surface-container p-4">
                <h3 className="mb-3 text-label-md text-on-surface">{title}</h3>
                <div className="space-y-4">
                  <TextField label="Name" required {...fieldProps(`${prefix}_name`)} />
                  <SelectField
                    label="Occupation"
                    placeholder="Select occupation"
                    options={PARENT_OCCUPATIONS}
                    {...fieldProps(`${prefix}_occupation`)}
                  />
                  <TextField label="Name of the organization" {...fieldProps(`${prefix}_organization`)} />
                  <TextField label="Designation" {...fieldProps(`${prefix}_designation`)} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Mobile no." inputMode="numeric" maxLength={10} {...fieldProps(`${prefix}_mobile`)} />
                    <TextField label="Email ID" type="email" {...fieldProps(`${prefix}_email`)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* ── Address ─────────────────────────────────────────────────── */}
        <Panel tab="Address" tabIcon="home_pin">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <TextAreaField label="Address for communication" required rows={3} {...fieldProps('communication_address')} />
              <TextField label="Pin code" required inputMode="numeric" maxLength={6} {...fieldProps('communication_pin_code')} />
            </div>
            <div className="space-y-4">
              <CheckboxField
                label="Permanent address is the same as above"
                checked={form.permanent_same_as_communication}
                onChange={update('permanent_same_as_communication')}
                disabled={locked}
              />
              {!form.permanent_same_as_communication && (
                <>
                  <TextAreaField label="Permanent address" required rows={3} {...fieldProps('permanent_address')} />
                  <TextField label="Pin code" required inputMode="numeric" maxLength={6} {...fieldProps('permanent_pin_code')} />
                </>
              )}
            </div>
          </div>
        </Panel>

        {/* ── Uploads ─────────────────────────────────────────────────── */}
        <Panel tab="Optional Uploads" tabIcon="attach_file">
          <div className="grid gap-4 lg:grid-cols-2">
            <FileField
              label="Business card of the parent"
              hint={uploading === 'businessCard' ? 'Uploading...' : 'Optional. PNG, JPG or PDF.'}
              currentName={uploads.businessCard || (form.parent_business_card_path ? 'File on record' : '')}
              onFileSelected={(file) => handleUpload('businessCard', file)}
              disabled={locked || uploading !== null}
            />
            <FileField
              label="Signature of the student"
              hint={uploading === 'signature' ? 'Uploading...' : 'Optional. PNG, JPG or PDF.'}
              currentName={uploads.signature || (form.student_signature_path ? 'File on record' : '')}
              onFileSelected={(file) => handleUpload('signature', file)}
              disabled={locked || uploading !== null}
            />
          </div>
          <p className="mt-3 text-label-sm text-tertiary">
            Uploads are stored privately. Only you, your assigned mentor and the HOD can open them.
          </p>
        </Panel>

        {!locked && (
          <div className="flex flex-wrap items-center justify-end gap-3 pb-6">
            <p className="mr-auto text-label-sm text-tertiary">
              Once submitted, this form can only be reopened by your HOD.
            </p>
            <button type="submit" className="btn-primary" disabled={pending || uploading !== null}>
              {pending ? 'Submitting...' : 'Submit Form A'}
            </button>
          </div>
        )}
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        pending={pending}
        title="Submit Form A?"
        confirmLabel="Yes, submit"
        message="Please check your details once more. After submitting, the form becomes read-only and only your HOD can reopen it for corrections."
      />
    </PortalShell>
  );
}
