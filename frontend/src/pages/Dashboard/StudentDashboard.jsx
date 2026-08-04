import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import API from '../../services/api';
import StatusBadge from '../../components/ui/StatusBadge';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/ui/EmptyState';
import mujLogo from '../../assets/logo.png';

// Helper: format relative time
const relativeTime = (date) => {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const CATEGORIES = ['Academic', 'ERP/Tech', 'Infrastructure'];

const StudentDashboard = () => {
  const { user, logout, refreshUser } = useAuth();
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Selected ticket for chat
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const chatEndRef = useRef(null);

  // New ticket form
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Academic');
  const [raiseError, setRaiseError] = useState(null);
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Security password change
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [securityError, setSecurityError] = useState(null);
  const [securitySuccess, setSecuritySuccess] = useState(false);

  // Satisfaction rating state
  const [hoveredStar, setHoveredStar] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  // Confirm resolve dialog
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);

  useEffect(() => {
    fetchTickets();
    if (user && !user.tempPasswordUsed) {
      setIsSecurityModalOpen(true);
    }
  }, [user]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTicket?.messages]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await API.get('/tickets');
      if (res.data?.success) setTickets(res.data.data.tickets);
    } catch {
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleRaiseTicket = async (e) => {
    e.preventDefault();
    setRaiseError(null);
    if (!subject.trim() || !description.trim()) {
      setRaiseError('Subject and description are required');
      return;
    }
    try {
      setSubmittingTicket(true);
      const res = await API.post('/tickets', { subject, description, category });
      if (res.data?.success) {
        setIsRaiseModalOpen(false);
        setSubject(''); setDescription(''); setCategory('Academic');
        toast.success('Support ticket raised successfully!');
        fetchTickets();
      }
    } catch (err) {
      setRaiseError(err.response?.data?.message || 'Failed to raise ticket');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleOpenTicket = async (ticket) => {
    try {
      const res = await API.get(`/tickets/${ticket._id}`);
      if (res.data?.success) {
        setSelectedTicket(res.data.data.ticket);
        setIsDetailOpen(true);
      }
    } catch {
      toast.error('Could not retrieve ticket details');
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    // Optimistic UI: add message immediately
    const optimisticMsg = {
      _id: `opt_${Date.now()}`,
      sender: { _id: user._id, name: user.name },
      text: replyText,
      timestamp: new Date().toISOString(),
      isOptimistic: true,
    };
    setSelectedTicket(prev => ({
      ...prev,
      messages: [...prev.messages, optimisticMsg],
    }));
    const sentText = replyText;
    setReplyText('');

    try {
      setSendingReply(true);
      const res = await API.post(`/tickets/${selectedTicket._id}/messages`, { text: sentText });
      if (res.data?.success) {
        setSelectedTicket(res.data.data.ticket);
        fetchTickets();
      }
    } catch {
      // Roll back optimistic message
      setSelectedTicket(prev => ({
        ...prev,
        messages: prev.messages.filter(m => m._id !== optimisticMsg._id),
      }));
      setReplyText(sentText);
      toast.error('Failed to send reply — please try again');
    } finally {
      setSendingReply(false);
    }
  };

  const handleResolveTicket = async () => {
    setShowResolveConfirm(false);
    try {
      const res = await API.put(`/tickets/${selectedTicket._id}/resolve`);
      if (res.data?.success) {
        setSelectedTicket(res.data.data.ticket);
        fetchTickets();
        toast.success('Ticket marked as resolved');
      }
    } catch {
      toast.error('Failed to resolve ticket');
    }
  };

  const handleRateStar = async (stars) => {
    if (selectedTicket.satisfactionRating !== null) return;
    try {
      setRatingSubmitting(true);
      const res = await API.patch(`/tickets/${selectedTicket._id}/rating`, { rating: stars });
      if (res.data?.success) {
        setSelectedTicket(res.data.data.ticket);
        fetchTickets();
        toast.success('Thank you for your feedback! ⭐'.repeat(stars).substring(0, 6 + stars));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit rating');
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setSecurityError(null);
    setSecuritySuccess(false);
    if (!oldPassword || !newPassword) {
      setSecurityError('Please fill in both password fields');
      return;
    }
    try {
      const res = await API.put('/auth/update-password', { oldPassword, newPassword });
      if (res.data?.success) {
        setSecuritySuccess(true);
        setOldPassword(''); setNewPassword('');
        refreshUser();
        toast.success('Password updated successfully!');
        setTimeout(() => setIsSecurityModalOpen(false), 1800);
      }
    } catch (err) {
      setSecurityError(err.response?.data?.message || 'Failed to update password');
    }
  };

  // Derived stats from local ticket state (no extra fetch)
  const openCount     = tickets.filter(t => t.status === 'Open').length;
  const inProgCount   = tickets.filter(t => t.status === 'In Progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'Resolved').length;

  return (
    <div className="bg-background font-body text-on-background min-h-screen">
      {/* AppBar */}
      <header className="bg-surface border-b border-outline-variant flex justify-between items-center w-full px-margin h-20 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-md">
          <div className="flex flex-col items-start leading-none">
            <img src={mujLogo} alt="Manipal University Jaipur" className="h-10 object-contain animate-fade-in" style={{ mixBlendMode: 'multiply' }} />
            <span className="text-[9px] font-headline font-extrabold text-primary tracking-widest mt-1 uppercase">SSMP</span>
          </div>
          <div className="hidden md:flex ml-lg gap-md">
            <a className="font-label text-label-md text-primary border-b-2 border-primary py-xs font-semibold" href="#">Student Portal</a>
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <button className="p-xs rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant flex items-center">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button onClick={logout} className="font-label text-label-md text-error flex items-center gap-xs px-sm py-1 border border-error/20 rounded-full hover:bg-error-container/10 transition-all font-semibold">
            <span className="material-symbols-outlined text-sm">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-margin py-lg">
        <div className="w-full h-1 bg-[#f47d45] rounded-full mb-6" />

        {/* Security Warning Banner */}
        {!user?.tempPasswordUsed && (
          <section className="mb-lg p-sm bg-error-container text-on-error-container rounded-xl border border-error/30 flex justify-between items-center animate-pulse">
            <div className="flex items-center gap-sm">
              <span className="material-symbols-outlined text-xl">warning</span>
              <p className="text-sm font-semibold">You are logged in with temporary credentials. Update your password to secure your account.</p>
            </div>
            <button onClick={() => setIsSecurityModalOpen(true)} className="px-sm py-1 bg-error text-white text-xs font-bold rounded-lg hover:opacity-90">
              Update Now
            </button>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg">
          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-md">
            {/* Profile Card */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm">
              <h3 className="font-headline text-headline-md text-primary mb-sm font-bold">Student Profile</h3>
              <div className="flex items-center gap-md mb-md">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary-container">
                  <div className="w-full h-full flex items-center justify-center bg-surface-container-high text-primary">
                    <span className="material-symbols-outlined text-[40px]">account_circle</span>
                  </div>
                </div>
                <div>
                  <p className="font-label text-label-sm text-on-surface-variant font-medium">Reg No. {user?.loginId}</p>
                  <p className="font-headline text-headline-md text-on-surface font-semibold">{user?.name}</p>
                </div>
              </div>
              <div className="space-y-xs border-t border-outline-variant pt-md">
                {[
                  ['Section', user?.section],
                  ['Branch', user?.branch],
                  ['Semester', user?.semester],
                  ['Official Email', user?.email],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-on-surface-variant text-label-md">{label}</span>
                    <span className="font-label text-primary font-semibold truncate max-w-[200px]">{val || 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stat Summary */}
            <div className="grid grid-cols-3 gap-xs">
              {[
                { label: 'Open', value: openCount, color: 'bg-error-container text-on-error-container' },
                { label: 'Active', value: inProgCount, color: 'bg-secondary-container text-on-secondary-container' },
                { label: 'Done', value: resolvedCount, color: 'bg-[#e6f4ee] text-[#0a6c44]' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-sm text-center border border-outline-variant/30 ${s.color}`}>
                  <p className="text-2xl font-extrabold font-headline">{s.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Mentor Card */}
            {user?.assignedMentor && (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm">
                <h4 className="font-headline text-lg font-bold text-primary mb-sm">Assigned Mentor</h4>
                <div className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-3xl text-secondary">school</span>
                  <div>
                    <p className="font-label text-label-md text-on-surface font-semibold">{user.assignedMentor.name || 'Mentor assigned'}</p>
                    <p className="text-xs text-on-surface-variant">{user.assignedMentor.email}</p>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Main Content */}
          <section className="lg:col-span-8 space-y-lg">
            <div>
              <div className="flex items-center justify-between mb-md">
                <h2 className="font-headline text-2xl font-bold text-primary">Support Tickets</h2>
                <button
                  onClick={() => setIsRaiseModalOpen(true)}
                  className="text-primary font-label flex items-center gap-xs hover:underline font-semibold"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  Raise New Ticket
                </button>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
                {loading ? (
                  <SkeletonLoader variant="table" rows={4} />
                ) : tickets.length === 0 ? (
                  <EmptyState
                    icon="forum"
                    heading="No active support tickets"
                    subtext="If you have any academic, infrastructure, or portal issues, click 'Raise New Ticket' to request support."
                    action={
                      <button onClick={() => setIsRaiseModalOpen(true)} className="px-md py-xs rounded-full bg-primary text-white font-semibold text-sm hover:opacity-90">
                        Raise a Ticket
                      </button>
                    }
                  />
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container border-b border-outline-variant">
                        {['Ticket ID', 'Subject', 'Status', 'Updated'].map(h => (
                          <th key={h} className="px-md py-sm font-label text-on-surface-variant font-semibold text-xs uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {tickets.map(ticket => (
                        <tr
                          key={ticket._id}
                          onClick={() => handleOpenTicket(ticket)}
                          className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                        >
                          <td className="px-md py-md font-label text-primary font-semibold text-sm">{ticket.ticketId}</td>
                          <td className="px-md py-md">
                            <p className="font-label text-on-surface font-semibold text-sm">{ticket.subject}</p>
                            <p className="text-xs text-on-surface-variant font-medium">{ticket.category}</p>
                          </td>
                          <td className="px-md py-md"><StatusBadge status={ticket.status} /></td>
                          <td className="px-md py-md text-xs text-on-surface-variant">{relativeTime(ticket.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ── MODAL 1: Raise Ticket ── */}
      {isRaiseModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-sm backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl max-w-lg w-full overflow-hidden shadow-2xl animate-scale-in">
            <div className="bg-surface-container-low px-md py-sm border-b border-outline-variant flex justify-between items-center">
              <h3 className="font-headline text-lg font-bold text-primary">Raise New Support Ticket</h3>
              <button onClick={() => setIsRaiseModalOpen(false)} className="material-symbols-outlined text-on-surface-variant hover:text-primary">close</button>
            </div>
            <form onSubmit={handleRaiseTicket} className="p-md space-y-md">
              {raiseError && (
                <div className="p-sm bg-error-container text-on-error-container rounded-xl text-sm font-semibold flex items-center gap-xs">
                  <span className="material-symbols-outlined text-md">error</span>
                  <span>{raiseError}</span>
                </div>
              )}
              <div className="flex flex-col space-y-xs">
                <label className="text-label-md text-on-surface font-semibold" htmlFor="category">Support Category</label>
                <select id="category" className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-body-md focus:ring-2 focus:ring-primary" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="Academic">Academic (Grading, Course Appeal, Mentorship)</option>
                  <option value="ERP/Tech">ERP / Portal Login (ERP credentials, Finance portal)</option>
                  <option value="Infrastructure">Infrastructure (Lab equipment, Facilities)</option>
                </select>
              </div>
              <div className="flex flex-col space-y-xs">
                <label className="text-label-md text-on-surface font-semibold" htmlFor="subject">Subject</label>
                <input id="subject" type="text" placeholder="Summarize your issue..." className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-body-md form-input-focus" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div className="flex flex-col space-y-xs">
                <label className="text-label-md text-on-surface font-semibold" htmlFor="description">Detailed Description</label>
                <textarea id="description" rows="4" placeholder="Provide details..." className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-body-md form-input-focus" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div className="flex justify-end gap-sm pt-sm border-t border-outline-variant">
                <button type="button" onClick={() => setIsRaiseModalOpen(false)} className="px-md py-xs rounded-full border border-outline-variant hover:bg-surface-container-low font-semibold text-sm">Cancel</button>
                <button type="submit" disabled={submittingTicket} className="px-md py-xs rounded-full bg-primary text-white hover:opacity-90 font-semibold text-sm shadow-md disabled:opacity-60">
                  {submittingTicket ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Ticket Detail & Chat ── */}
      {isDetailOpen && selectedTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-sm backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl max-w-2xl w-full h-[620px] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            {/* Header */}
            <div className="bg-surface-container-low px-md py-sm border-b border-outline-variant flex justify-between items-center">
              <div className="min-w-0">
                <span className="font-label text-xs text-primary font-bold uppercase">{selectedTicket.ticketId} • {selectedTicket.category}</span>
                <h3 className="font-headline text-lg font-bold text-on-surface truncate">{selectedTicket.subject}</h3>
              </div>
              <div className="flex items-center gap-xs shrink-0">
                <StatusBadge status={selectedTicket.status} size="lg" />
                <button onClick={() => { setIsDetailOpen(false); setShowResolveConfirm(false); }} className="material-symbols-outlined text-on-surface-variant hover:text-primary ml-1">close</button>
              </div>
            </div>

            {/* Message Thread */}
            <div className="flex-1 overflow-y-auto p-md space-y-sm bg-background/50 custom-scrollbar">
              <div className="text-center py-xs border-b border-dashed border-outline-variant">
                <span className="text-xs text-on-surface-variant font-medium">Thread started {new Date(selectedTicket.createdAt).toLocaleString()}</span>
              </div>
              {selectedTicket.messages.map((msg, i) => {
                const isMyMessage = msg.sender?._id === user._id || msg.sender === user._id;
                return (
                  <div key={msg._id || i} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-sm rounded-xl border ${
                      isMyMessage
                        ? 'bg-primary-container/10 border-primary/20 text-on-surface rounded-br-none'
                        : 'bg-white border-outline-variant text-on-surface rounded-bl-none shadow-sm'
                    } ${msg.isOptimistic ? 'opacity-60' : ''}`}>
                      <div className="flex justify-between items-baseline gap-md mb-xs">
                        <span className="text-xs font-semibold text-primary">{isMyMessage ? 'You' : (msg.sender?.name || 'Mentor')}</span>
                        <span className="text-[10px] text-on-surface-variant">
                          {msg.isOptimistic ? 'Sending...' : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm font-body whitespace-pre-line">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Satisfaction Rating (Resolved tickets) */}
            {selectedTicket.status === 'Resolved' && (
              <div className="bg-surface-container px-md py-sm border-t border-outline-variant">
                {selectedTicket.satisfactionRating !== null ? (
                  <div className="flex items-center gap-sm justify-center">
                    <span className="text-xs font-bold text-on-surface-variant">Your rating:</span>
                    {[1,2,3,4,5].map(s => (
                      <span key={s} className={`material-symbols-outlined text-xl ${s <= selectedTicket.satisfactionRating ? 'text-[#f47d45]' : 'text-outline-variant'}`} style={{ fontVariationSettings: `'FILL' ${s <= selectedTicket.satisfactionRating ? 1 : 0}` }}>star</span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-xs">
                    <p className="text-xs font-semibold text-on-surface-variant">How helpful was your mentor? Rate this ticket:</p>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(s => (
                        <button
                          key={s}
                          type="button"
                          disabled={ratingSubmitting}
                          onMouseEnter={() => setHoveredStar(s)}
                          onMouseLeave={() => setHoveredStar(0)}
                          onClick={() => handleRateStar(s)}
                          className="transition-transform hover:scale-125 active:scale-110 disabled:opacity-50"
                        >
                          <span
                            className={`material-symbols-outlined text-2xl ${s <= (hoveredStar || 0) ? 'text-[#f47d45]' : 'text-outline-variant'}`}
                            style={{ fontVariationSettings: `'FILL' ${s <= (hoveredStar || 0) ? 1 : 0}` }}
                          >star</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reply Footer */}
            <div className="bg-surface-container-low border-t border-outline-variant p-md">
              {selectedTicket.status === 'Resolved' ? (
                <div className="p-sm bg-surface-container text-center rounded-xl font-semibold text-sm text-on-surface-variant">
                  This support ticket is resolved and closed.
                </div>
              ) : showResolveConfirm ? (
                <div className="flex items-center gap-sm bg-error-container/50 border border-error/20 rounded-xl p-sm">
                  <span className="material-symbols-outlined text-error text-sm">warning</span>
                  <p className="text-xs font-semibold text-on-surface flex-1">Are you sure you want to mark this as resolved?</p>
                  <button onClick={handleResolveTicket} className="px-sm py-1 bg-error text-white text-xs font-bold rounded-lg hover:opacity-90">Yes, Resolve</button>
                  <button onClick={() => setShowResolveConfirm(false)} className="px-sm py-1 border border-outline-variant text-xs font-bold rounded-lg hover:bg-surface-container-low">Cancel</button>
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="flex gap-sm items-center">
                  <button type="button" onClick={() => setShowResolveConfirm(true)} className="px-md py-3 border border-success/30 text-success bg-success/5 rounded-xl hover:bg-success/15 font-semibold text-xs transition-colors shrink-0">
                    Mark Resolved
                  </button>
                  <input
                    type="text"
                    placeholder="Type message to mentor..."
                    className="flex-1 px-sm py-3 rounded-xl border border-outline-variant bg-surface-container-lowest font-body text-sm form-input-focus"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                  />
                  <button type="submit" disabled={sendingReply} className="w-10 h-10 rounded-xl bg-primary text-white hover:opacity-90 flex items-center justify-center shrink-0 shadow-md active:scale-95 transition-transform disabled:opacity-50">
                    <span className="material-symbols-outlined text-md">send</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Security Update ── */}
      {isSecurityModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-sm backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="bg-error-container text-on-error-container px-md py-sm border-b border-error/20 flex justify-between items-center">
              <h3 className="font-headline font-bold flex items-center gap-xs">
                <span className="material-symbols-outlined">security</span>
                <span>Security Update Required</span>
              </h3>
              <button onClick={() => setIsSecurityModalOpen(false)} className="material-symbols-outlined text-on-error-container hover:opacity-70">close</button>
            </div>
            <form onSubmit={handleChangePassword} className="p-md space-y-md">
              <p className="text-sm text-on-surface-variant">You are using the default system-generated password. Set a strong custom password to secure your account.</p>
              {securityError && (
                <div className="p-sm bg-error-container text-on-error-container rounded-xl text-xs font-semibold flex items-center gap-xs">
                  <span className="material-symbols-outlined text-sm">error</span><span>{securityError}</span>
                </div>
              )}
              {securitySuccess && (
                <div className="p-sm bg-[#e6f4ee] text-[#0a6c44] rounded-xl text-xs font-semibold flex items-center gap-xs">
                  <span className="material-symbols-outlined text-sm">check_circle</span><span>Password updated! Closing...</span>
                </div>
              )}
              <div className="flex flex-col space-y-xs">
                <label className="text-xs font-semibold text-on-surface" htmlFor="oldPassword">Current Password</label>
                <input id="oldPassword" type="password" placeholder="Enter temporary password" className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-sm form-input-focus" value={oldPassword} onChange={e => setOldPassword(e.target.value)} disabled={securitySuccess} />
              </div>
              <div className="flex flex-col space-y-xs">
                <label className="text-xs font-semibold text-on-surface" htmlFor="newPassword">New Password</label>
                <input id="newPassword" type="password" placeholder="Enter a new strong password" className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-sm form-input-focus" value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={securitySuccess} />
              </div>
              <div className="flex justify-end gap-sm pt-sm border-t border-outline-variant">
                <button type="button" onClick={() => setIsSecurityModalOpen(false)} className="px-md py-xs rounded-full border border-outline-variant hover:bg-surface-container-low font-semibold text-xs">Cancel</button>
                <button type="submit" disabled={securitySuccess} className="px-md py-xs rounded-full bg-primary text-white hover:opacity-90 font-semibold text-xs shadow-md disabled:opacity-60">Update Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="mt-xl border-t border-outline-variant bg-surface py-lg text-center">
        <p className="text-label-sm text-on-surface-variant">© 2024 Student-Mentor Management Portal. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default StudentDashboard;
