import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormAFields, { useFormAState } from './FormAFields.jsx';
import Modal, { ConfirmDialog } from '../ui/Modal.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';

export default function StudentOnboardingModal() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { run, pending } = useAsyncAction();
  const formA = useFormAState(profile);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openConfirm = (event) => {
    event.preventDefault();
    if (formA.validate()) setConfirmOpen(true);
  };

  const submit = () =>
    run(
      async () => {
        const payload = formA.validate();
        if (!payload) throw new Error('Please fix the highlighted fields.');
        const { error } = await supabase.rpc('submit_student_form_a', { p_payload: payload });
        if (error) throw error;
      },
      {
        successMessage: 'Form A submitted. Welcome to the portal!',
        onSuccess: async () => {
          setConfirmOpen(false);
          await refreshProfile();
          // Step 2 of onboarding: the mandatory profile photo.
          navigate('/student/profile-photo', { replace: true });
        }
      }
    );

  return (
    <>
      <Modal
        open={true}
        dismissible={false}
        title="Form A — Mentor-Mentee Scheme"
        size="xl"
        description="Before you can use the portal, the department needs your mentorship record. It takes about five minutes. You can correct any of it later from your profile page."
      >
        <form onSubmit={openConfirm}>
          <FormAFields
            form={formA.form}
            errors={formA.errors}
            setField={formA.setField}
            uploads={formA.uploads}
            uploading={formA.uploading}
            onUpload={formA.upload}
            disabled={pending}
          />

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 pb-6">
            <p className="mr-auto text-label-sm text-tertiary">
              Fields marked <span className="text-error">*</span> are required.
            </p>
            <button type="submit" className="btn-primary" disabled={pending || formA.uploading !== null}>
              {pending ? 'Submitting...' : 'Submit and continue'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        pending={pending}
        title="Submit Form A?"
        confirmLabel="Yes, submit"
        message="Next you will be asked for a profile photo, then the portal opens. If anything here needs correcting later, you can edit it yourself from your profile page."
      />
    </>
  );
}
