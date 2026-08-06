import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../../components/layout/PortalShell.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { PageLoader } from '../../components/ui/Skeleton.jsx';
import { TextField } from '../../components/ui/FormControls.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { formatDate, formatDateTime, initialsOf } from '../../lib/formatters.js';

export default function StudentProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { run, pending } = useAsyncAction();
  const [formA, setFormA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState(profile?.phone ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('student_form_a_profiles')
      .select('*')
      .eq('student_id', profile.id)
      .maybeSingle();
    setFormA(data);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveContact = (event) => {
    event.preventDefault();
    if (phone && !/^[0-9]{10}$/.test(phone)) return;
    run(
      async () => {
        const { error } = await supabase
          .from('user_profiles')
          .update({ phone: phone || null })
          .eq('id', profile.id);
        if (error) throw error;
      },
      { successMessage: 'Contact details updated.', onSuccess: refreshProfile }
    );
  };

  if (loading) return <PortalShell><PageLoader /></PortalShell>;

  return (
    <PortalShell>
      <PageHeader title="My profile" subtitle="Your department record and mentorship details." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel tab="Identity" tabIcon="badge">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-headline-sm text-white">
              {initialsOf(profile.full_name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-headline-sm text-on-surface">{profile.full_name}</h2>
              <p className="truncate text-body-sm text-on-surface-variant">{profile.email}</p>
              {profile.is_star_mentee && (
                <span className="chip mt-1.5 bg-warning-container text-on-warning-container">
                  <span className="material-symbols-outlined text-[14px]">workspace_premium</span>
                  Student representative
                </span>
              )}
            </div>
          </div>

          <dl className="mt-5 space-y-3 text-body-sm">
            {[
              ['Registration no.', profile.login_id ?? '—'],
              ['Branch', profile.branch ?? '—'],
              ['Section', profile.section ?? '—'],
              ['Semester', profile.semester_label ?? '—'],
              ['Department', profile.department ?? '—'],
              ['Joined', formatDate(profile.created_at)]
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-tertiary">{label}</dt>
                <dd className="text-right text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel tab="My mentor" tabIcon="supervisor_account">
          {profile.mentor ? (
            <dl className="space-y-3 text-body-sm">
              {[
                ['Name', profile.mentor.full_name],
                ['Email', profile.mentor.email],
                ['Phone', profile.mentor.phone ?? 'Not provided'],
                ['Faculty ID', profile.mentor.login_id ?? '—']
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-label-sm uppercase tracking-wide text-tertiary">{label}</dt>
                  <dd className="mt-0.5 break-words text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-body-sm text-on-surface-variant">
              No mentor assigned yet. Contact the HOD office.
            </p>
          )}
        </Panel>

        <Panel tab="Contact details" tabIcon="edit">
          <form onSubmit={saveContact} className="space-y-4">
            <TextField label="Email" value={profile.email} disabled hint="Managed by the university. Contact IT to change it." />
            <TextField
              name="phone"
              label="Mobile number"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
              error={phone && !/^[0-9]{10}$/.test(phone) ? 'Enter a 10-digit number.' : undefined}
            />
            <button type="submit" className="btn-primary w-full" disabled={pending}>
              {pending ? 'Saving...' : 'Save changes'}
            </button>
            <Link to="/change-password" className="btn-secondary w-full">
              Change password
            </Link>
          </form>
        </Panel>
      </div>

      <Panel tab="Form A — Mentor-Mentee record" tabIcon="assignment" className="mt-4">
        {formA?.is_submitted ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="chip bg-success-container text-on-success-container">
                <span className="material-symbols-outlined text-[14px]">verified</span>
                Submitted {formatDateTime(formA.submitted_at)}
              </span>
              <Link to="/student/onboarding" className="btn-ghost btn-sm">
                View full form
              </Link>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Date of birth', formatDate(formA.date_of_birth)],
                ['Blood group', formA.blood_group ?? '—'],
                ['Hostel', formA.is_day_scholar ? 'Day scholar' : `${formA.hostel_block ?? '—'} / ${formA.room_no ?? '—'}`],
                ['Mobile', formA.mobile_no],
                ["Father's name", formA.father_name],
                ["Mother's name", formA.mother_name],
                ['Pin code', formA.communication_pin_code],
                ['GPA sharing', formA.gpa_sharing_enabled ? 'Enabled' : 'Hidden from faculty']
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-label-sm uppercase tracking-wide text-tertiary">{label}</dt>
                  <dd className="mt-0.5 break-words text-body-sm text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-on-surface-variant">
              You have not submitted Form A yet. It is a one-time departmental record.
            </p>
            <Link to="/student/onboarding" className="btn-primary">
              Fill Form A
            </Link>
          </div>
        )}
      </Panel>
    </PortalShell>
  );
}
