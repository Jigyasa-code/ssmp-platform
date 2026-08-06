import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { TextField, TextAreaField, SelectField, RadioGroupField } from '../ui/FormControls.jsx';
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '../../lib/constants.js';
import { supabase } from '../../lib/supabaseClient.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';

const EMPTY = { subject: '', category: 'Academic', priority: 'Medium', description: '' };

export default function CreateTicketModal({ open, onClose, onCreated, mentorName }) {
  const { run, pending } = useAsyncAction();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event?.target ? event.target.value : event }));

  const validate = () => {
    const next = {};
    if (form.subject.trim().length < 5) next.subject = 'Give your issue a clear subject (at least 5 characters).';
    if (form.subject.length > 200) next.subject = 'Keep the subject under 200 characters.';
    if (form.description.trim().length < 15) next.description = 'Please describe the issue in a little more detail.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    await run(
      async () => {
        const { data, error } = await supabase.rpc('create_support_ticket', {
          p_subject: form.subject.trim(),
          p_category: form.category,
          p_description: form.description.trim(),
          p_priority: form.priority
        });
        if (error) throw error;
        return data;
      },
      {
        successMessage: 'Ticket raised. Your mentor has been notified.',
        onSuccess: (ticket) => {
          setForm(EMPTY);
          setErrors({});
          onCreated?.(ticket);
          onClose();
        }
      }
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a support ticket"
      description={mentorName ? `This will go to your mentor, ${mentorName}.` : undefined}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form="create-ticket-form" className="btn-primary" disabled={pending}>
            {pending ? 'Submitting...' : 'Raise ticket'}
          </button>
        </>
      }
    >
      <form id="create-ticket-form" onSubmit={submit} className="space-y-4">
        <TextField
          name="subject"
          label="Subject"
          required
          maxLength={200}
          value={form.subject}
          onChange={update('subject')}
          error={errors.subject}
          placeholder="e.g. Unable to log in to the ERP portal"
        />
        <SelectField
          name="category"
          label="Category"
          required
          value={form.category}
          onChange={update('category')}
          options={TICKET_CATEGORIES}
        />
        <RadioGroupField
          label="Priority"
          name="priority"
          value={form.priority}
          onChange={update('priority')}
          options={TICKET_PRIORITIES}
        />
        <TextAreaField
          name="description"
          label="Describe the issue"
          required
          rows={5}
          maxLength={5000}
          value={form.description}
          onChange={update('description')}
          error={errors.description}
          hint="Include what you tried, any error message, and when it started."
        />
      </form>
    </Modal>
  );
}
