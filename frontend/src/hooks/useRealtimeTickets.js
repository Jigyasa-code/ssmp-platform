/**
 * useRealtimeTickets
 * Loads tickets the caller is allowed to see (RLS decides that, not this
 * file) and keeps the list live over Realtime.
 *
 * The same hook backs all three portals — students see their own tickets,
 * faculty see the ones assigned to them, the HOD sees everything, because
 * the SELECT policy on support_tickets already scopes the query.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { describeError } from '../lib/formatters.js';

const SELECT = `
  *,
  student:student_id (id, full_name, email, login_id, section, branch, semester_label),
  mentor:mentor_id (id, full_name, email, login_id)
`;

export function useRealtimeTickets({ status, category, search, pageSize = 25 } = {}) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('support_tickets')
      .select(SELECT, { count: 'exact' })
      .order('last_message_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status && status !== 'All') query = query.eq('status', status);
    if (category && category !== 'All') query = query.eq('category', category);
    if (search?.trim()) {
      const term = search.trim().replace(/[%,]/g, '');
      query = query.or(`subject.ilike.%${term}%,ticket_code.ilike.%${term}%`);
    }

    const { data, error: queryError, count } = await query;
    if (queryError) {
      setError(describeError(queryError));
    } else {
      setTickets(data ?? []);
      setTotal(count ?? 0);
      setError(null);
    }
    setLoading(false);
  }, [status, category, search, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, category, search]);

  // Any insert/update on a ticket the user can see triggers a refresh.
  useEffect(() => {
    const channel = supabase
      .channel('tickets-stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return { tickets, loading, error, page, setPage, pageCount, total, reload: load };
}

/** A single ticket plus its live message thread. */
export function useTicketThread(ticketId) {
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);

    const [{ data: ticketRow, error: ticketError }, { data: messageRows, error: messageError }] =
      await Promise.all([
        supabase.from('support_tickets').select(SELECT).eq('id', ticketId).single(),
        supabase
          .from('ticket_messages')
          .select('*, sender:sender_id (id, full_name, role)')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true })
      ]);

    if (ticketError || messageError) {
      setError(describeError(ticketError ?? messageError));
    } else {
      setTicket(ticketRow);
      setMessages(messageRows ?? []);
      setError(null);
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!ticketId) return undefined;
    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, load]);

  return { ticket, messages, loading, error, reload: load };
}
