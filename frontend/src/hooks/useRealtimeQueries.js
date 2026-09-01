/**
 * useRealtimeQueries
 * Loads queries the caller is allowed to see (RLS decides that, not this
 * file) and keeps the list live over Realtime.
 *
 * The same hook backs all three portals — students see their own queries,
 * faculty see the ones assigned to them, the HOD sees everything, because
 * the SELECT policy on support_queries already scopes the query.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { describeError } from '../lib/formatters.js';

const SELECT = `
  *,
  student:student_id (id, full_name, email, login_id, section, branch, semester_label),
  mentor:mentor_id (id, full_name, email, login_id)
`;

export function useRealtimeQueries({ status, category, search, pageSize = 25 } = {}) {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('support_queries')
      .select(SELECT, { count: 'exact' })
      .order('last_message_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status && status !== 'All') query = query.eq('status', status);
    if (category && category !== 'All') query = query.eq('category', category);
    if (search?.trim()) {
      const term = search.trim().replace(/[%,]/g, '');
      query = query.or(`subject.ilike.%${term}%,query_code.ilike.%${term}%`);
    }

    const { data, error: queryError, count } = await query;
    if (queryError) {
      setError(describeError(queryError));
    } else {
      setQueries(data ?? []);
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

  // Any insert/update on a query the user can see triggers a refresh.
  useEffect(() => {
    const channel = supabase
      .channel('queries-stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_queries' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return { queries, loading, error, page, setPage, pageCount, total, reload: load };
}

/**
 * A single query plus its live message thread.
 *
 * `loading` is true only for the very first fetch. Every later refresh --
 * a new message arriving over Realtime, the query being resolved -- swaps
 * the data underneath without unmounting the page, so sending a message no
 * longer blanks the screen with "Loading query...".
 */
export function useQueryThread(queryId) {
  const [query, setQuery] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!queryId) return;
    if (!hasLoadedOnce.current) setLoading(true);

    const [{ data: queryRow, error: queryError }, { data: messageRows, error: messageError }] =
      await Promise.all([
        supabase.from('support_queries').select(SELECT).eq('id', queryId).single(),
        supabase
          .from('query_messages')
          .select('*, sender:sender_id (id, full_name, role, avatar_url)')
          .eq('query_id', queryId)
          .order('created_at', { ascending: true })
      ]);

    if (queryError || messageError) {
      // A failed background refresh must not wipe a thread that is on screen.
      if (!hasLoadedOnce.current) setError(describeError(queryError ?? messageError));
      else console.warn('[query] refresh failed:', (queryError ?? messageError).message);
    } else {
      setQuery(queryRow);
      setMessages(messageRows ?? []);
      setError(null);
    }
    hasLoadedOnce.current = true;
    setLoading(false);
  }, [queryId]);

  // A different query is a fresh page, so the loader is appropriate again.
  useEffect(() => {
    hasLoadedOnce.current = false;
  }, [queryId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!queryId) return undefined;
    const channel = supabase
      .channel(`query-${queryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'query_messages', filter: `query_id=eq.${queryId}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_queries', filter: `id=eq.${queryId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryId, load]);

  /** Appends a just-sent message, ignoring it if Realtime already did. */
  const appendMessage = useCallback((message) => {
    if (!message?.id) return;
    setMessages((current) =>
      current.some((existing) => existing.id === message.id) ? current : [...current, message]
    );
  }, []);

  return { query, messages, loading, error, reload: load, appendMessage };
}
