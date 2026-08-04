import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../services/api';

const FacultyTicketQueue = () => {
  const { user, logout } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  
  // Selected ticket for chat
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [replyText, setReplyText] = useState('');

  // Stats for cards
  const [stats, setStats] = useState({
    openTicketsCount: 0,
    avgResolutionTime: '4.2h',
    resolutionRate: '94.2%'
  });

  useEffect(() => {
    fetchTickets();
  }, [page, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await API.get('/users/stats');
      if (res.data && res.data.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await API.get('/tickets', {
        params: {
          status: statusFilter,
          category: categoryFilter,
          page,
          limit: 6
        }
      });
      if (res.data && res.data.success) {
        setTickets(res.data.data.tickets || []);
        setTotal(res.data.data.total || 0);
        setTotalPages(res.data.data.pages || 1);
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTicket = async (ticket) => {
    try {
      const res = await API.get(`/tickets/${ticket._id}`);
      if (res.data && res.data.success) {
        setSelectedTicket(res.data.data.ticket);
        setIsDetailOpen(true);
      }
    } catch (err) {
      alert('Could not retrieve ticket details');
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    try {
      const res = await API.post(`/tickets/${selectedTicket._id}/messages`, { text: replyText });
      if (res.data && res.data.success) {
        setSelectedTicket(res.data.data.ticket);
        setReplyText('');
        fetchTickets(); // Refresh list
        fetchStats();
      }
    } catch (err) {
      alert('Failed to send reply');
    }
  };

  const handleResolveTicket = async () => {
    if (!window.confirm('Are you sure you want to mark this ticket as resolved?')) return;
    try {
      const res = await API.put(`/tickets/${selectedTicket._id}/resolve`);
      if (res.data && res.data.success) {
        setSelectedTicket(res.data.data.ticket);
        fetchTickets();
        fetchStats();
      }
    } catch (err) {
      alert('Failed to resolve ticket');
    }
  };

  const handleFilterStatus = (status) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleFilterCategory = (e) => {
    setCategoryFilter(e.target.value);
    setPage(1);
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex">
      {/* SideNavBar */}
      <aside className="h-screen w-64 fixed left-0 top-0 bg-surface border-r border-outline-variant flex flex-col py-6 space-y-2 z-50">
        <div className="px-6 mb-8">
          <h1 className="text-headline text-2xl font-extrabold text-primary">
            {user?.role === 'hod' ? 'SSMP Portal' : 'Faculty Portal'}
          </h1>
          <p className="text-label-sm font-label font-medium text-on-surface-variant uppercase tracking-wider">
            {user?.role === 'hod' ? 'Department Admin' : 'Academic Support'}
          </p>
        </div>
        <nav className="flex-grow space-y-1">
          <Link to="/dashboard" className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors duration-200 px-4 py-3 mx-2">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="font-label text-label-md">Dashboard</span>
          </Link>
          <Link to="/ticket-queue" className="flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-xl px-4 py-3 mx-2 scale-95 transition-transform font-bold">
            <span className="material-symbols-outlined">forum</span>
            <span className="font-label text-label-md">Ticket Queue</span>
          </Link>
          {user?.role === 'hod' && (
            <Link to="/performance" className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors duration-200 px-4 py-3 mx-2">
              <span className="material-symbols-outlined">leaderboard</span>
              <span className="font-label text-label-md">Performance</span>
            </Link>
          )}
        </nav>
        <div className="px-4 mt-auto">
          <div className="p-4 bg-surface-container-low rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-primary text-3xl">account_circle</span>
              <div className="overflow-hidden">
                <p className="font-label text-label-md truncate font-semibold">{user?.name}</p>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                  {user?.role === 'hod' ? 'HOD / Administrator' : 'Senior Mentor'}
                </p>
              </div>
            </div>
            <button onClick={logout} className="w-full text-left font-label text-label-sm text-error flex items-center gap-xs mt-sm hover:underline font-semibold">
              <span className="material-symbols-outlined text-sm">logout</span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        {/* Top App Bar */}
        <header className="sticky top-0 bg-surface border-b border-outline-variant flex justify-between items-center w-full px-6 h-16 z-40 shadow-sm">
          <div className="flex items-center gap-4 flex-1">
            <span className="font-headline text-headline-md font-extrabold text-primary">SSMP Nexus</span>
            <div className="relative max-w-md w-full ml-8 hidden md:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
              <input 
                className="w-full bg-surface-container-low border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary focus:bg-white transition-all" 
                placeholder="Search support queue..." 
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-full transition-all relative">
              <span className="material-symbols-outlined">notifications</span>
              {stats.openTicketsCount > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full animate-ping"></span>}
            </button>
            <button className="p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-full transition-all">
              <span className="material-symbols-outlined">settings</span>
            </button>
            <div className="h-8 w-[1px] bg-outline-variant mx-2"></div>
            <button className="flex items-center gap-2 p-1 pl-2 hover:bg-surface-container-highest rounded-full transition-all">
              <span className="material-symbols-outlined text-primary-container text-2xl">account_circle</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="p-8 flex-grow custom-scrollbar overflow-y-auto">
          {/* Page Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="font-headline text-3xl text-on-surface font-bold">Support Ticket Queue</h2>
                <span className="px-3 py-1 bg-primary text-on-primary text-xs rounded-full font-bold">
                  {stats.openTicketsCount} Pending
                </span>
              </div>
              <p className="text-body-md text-on-surface-variant text-sm">Manage and respond to student inquiries across academic and technical domains.</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant mb-6 shadow-sm flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 pr-4 border-r border-outline-variant">
              <span className="text-label-md text-on-surface-variant font-semibold">Status:</span>
              <div className="flex bg-surface-container rounded-lg p-1">
                {['All', 'Open', 'In Progress', 'Resolved'].map(status => (
                  <button 
                    key={status}
                    onClick={() => handleFilterStatus(status)}
                    className={`px-4 py-1.5 text-label-md rounded-md text-sm font-semibold transition-all ${
                      statusFilter === status 
                        ? 'bg-surface-container-lowest text-primary shadow-sm' 
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-label-md text-on-surface-variant font-semibold">Category:</span>
              <select 
                value={categoryFilter}
                onChange={handleFilterCategory}
                className="bg-surface-container-low border-outline-variant text-label-md text-sm rounded-lg px-4 py-1.5 focus:ring-primary focus:border-primary font-semibold"
              >
                <option value="All Categories">All Categories</option>
                <option value="Academic">Academic</option>
                <option value="ERP/Tech">ERP/Tech</option>
                <option value="Infrastructure">Infrastructure</option>
              </select>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-label-md text-on-surface-variant font-semibold">Timeframe:</span>
              <button className="flex items-center gap-2 bg-surface-container-low border border-outline-variant text-label-md text-sm rounded-lg px-4 py-1.5 hover:bg-surface-container-high transition-colors font-semibold text-on-surface-variant">
                <span className="material-symbols-outlined text-sm">calendar_today</span>
                <span>Active Semester</span>
              </button>
            </div>
          </div>

          {/* Ticket List Table */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-xl text-center">
                <div className="w-8 h-8 rounded-full border-2 border-outline-variant border-t-primary animate-spin mx-auto mb-xs"></div>
                <span className="text-sm text-on-surface-variant font-medium">Fetching support queue...</span>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-xl text-center">
                <span className="material-symbols-outlined text-4xl text-outline mb-xs">drafts</span>
                <p className="text-on-surface font-semibold text-lg">No support tickets match filters</p>
                <p className="text-on-surface-variant text-sm mt-xs">Try selecting a different status or category category filter above.</p>
              </div>
            ) : (
              <>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold">Ticket ID</th>
                      <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold">Student</th>
                      <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold">Subject</th>
                      <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold text-center">Category</th>
                      <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold text-center">Status</th>
                      <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold">Last Update</th>
                      <th className="px-6 py-4 text-label-md text-on-surface-variant font-bold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {tickets.map(ticket => (
                      <tr 
                        key={ticket._id}
                        onClick={() => handleOpenTicket(ticket)}
                        className="group hover:bg-surface-container-low transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4 font-bold text-primary">{ticket.ticketId}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center border border-outline">
                              <span className="material-symbols-outlined text-secondary text-sm">person</span>
                            </div>
                            <div>
                              <p className="text-label-md font-bold text-on-surface">{ticket.studentId?.name || 'Student'}</p>
                              <p className="text-xs text-on-surface-variant font-medium">ID: {ticket.studentId?.loginId || 'N/A'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          <p className="text-body-md font-semibold text-on-surface truncate">{ticket.subject}</p>
                          <p className="text-xs text-on-surface-variant truncate font-medium">
                            {ticket.messages[0]?.text || 'No description'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2 py-1 bg-tertiary-fixed text-on-tertiary-fixed text-xs rounded-md font-bold uppercase tracking-wider">
                            {ticket.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            ticket.status === 'Open' ? 'bg-error-container text-on-error-container' :
                            ticket.status === 'In Progress' ? 'bg-secondary-container text-on-secondary-container' :
                            'bg-surface-container-highest text-on-surface-variant'
                          }`}>
                            {ticket.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-on-surface-variant">
                          {new Date(ticket.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="row-hover-action text-primary font-bold text-label-md flex items-center gap-1 ml-auto">
                            View <span className="material-symbols-outlined text-sm">arrow_forward</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination Footer */}
                <div className="bg-surface-container-low px-6 py-4 flex items-center justify-between border-t border-outline-variant">
                  <p className="text-label-sm text-on-surface-variant">
                    Showing <span className="font-bold text-on-surface">{Math.min(tickets.length, 6)}</span> of <span className="font-bold text-on-surface">{total}</span> tickets
                  </p>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPage(p => Math.max(p - 1, 1))}
                      disabled={page === 1}
                      className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-on-surface-variant disabled:opacity-30 hover:bg-surface-container"
                    >
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    <span className="text-sm font-bold text-on-surface">Page {page} of {totalPages}</span>
                    <button 
                      onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                      disabled={page === totalPages}
                      className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant text-on-surface-variant disabled:opacity-30 hover:bg-surface-container"
                    >
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Performance stats bento footer */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-2xl">timer</span>
              </div>
              <div>
                <p className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold text-xs">Avg Response Time</p>
                <h3 className="font-headline text-2xl font-extrabold text-on-surface">{stats.avgResolutionTime}</h3>
                <p className="text-[10px] text-primary flex items-center gap-1 font-semibold">
                  <span className="material-symbols-outlined text-xs">arrow_downward</span>
                  SLA Target &lt; 24h
                </p>
              </div>
            </div>
            
            <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-secondary-fixed flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-2xl">check_circle</span>
              </div>
              <div>
                <p className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold text-xs">Resolution Rate</p>
                <h3 className="font-headline text-2xl font-extrabold text-on-surface">{stats.resolutionRate}</h3>
                <p className="text-[10px] text-primary flex items-center gap-1 font-semibold">
                  <span className="material-symbols-outlined text-xs">arrow_upward</span>
                  High Resolution efficiency
                </p>
              </div>
            </div>

            <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
                <span className="material-symbols-outlined text-2xl">forum</span>
              </div>
              <div>
                <p className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold text-xs">Total Interactions</p>
                <h3 className="font-headline text-2xl font-extrabold text-on-surface">{stats.totalTicketsCount}</h3>
                <p className="text-[10px] text-on-surface-variant font-semibold">Active semester support load</p>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* DETAIL MODAL: Chat Conversation */}
      {isDetailOpen && selectedTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-sm backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl max-w-2xl w-full h-[600px] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            {/* Header */}
            <div className="bg-surface-container-low px-md py-sm border-b border-outline-variant flex justify-between items-center">
              <div>
                <span className="font-label text-xs text-primary font-bold uppercase">{selectedTicket.ticketId} • {selectedTicket.category}</span>
                <h3 className="font-headline text-lg font-bold text-on-surface truncate">{selectedTicket.subject}</h3>
                <p className="text-[10px] text-on-surface-variant font-semibold">
                  Student: {selectedTicket.studentId.name} ({selectedTicket.studentId.loginId} • Sec {selectedTicket.studentId.section})
                </p>
              </div>
              <div className="flex items-center gap-xs">
                <span className={`px-xs py-0.5 rounded text-xs font-bold uppercase ${
                  selectedTicket.status === 'Open' ? 'bg-error-container text-on-error-container' :
                  selectedTicket.status === 'In Progress' ? 'bg-secondary-container text-on-secondary-container' :
                  'bg-surface-container-highest text-on-surface-variant'
                }`}>
                  {selectedTicket.status}
                </span>
                <button onClick={() => setIsDetailOpen(false)} className="material-symbols-outlined text-on-surface-variant hover:text-primary">close</button>
              </div>
            </div>

            {/* Message History Thread */}
            <div className="flex-1 overflow-y-auto p-md space-y-sm bg-background/50 custom-scrollbar">
              <div className="text-center py-xs border-b border-dashed border-outline-variant">
                <span className="text-xs text-on-surface-variant font-medium">Ticket Thread started on {new Date(selectedTicket.createdAt).toLocaleString()}</span>
              </div>
              
              {selectedTicket.messages.map((msg, i) => {
                const isMyMessage = msg.sender._id === user._id || msg.sender === user._id;
                return (
                  <div key={i} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-sm rounded-xl border ${
                      isMyMessage 
                        ? 'bg-primary-container/10 border-primary/20 text-on-surface rounded-br-none' 
                        : 'bg-white border-outline-variant text-on-surface rounded-bl-none shadow-sm'
                    }`}>
                      <div className="flex justify-between items-baseline gap-md mb-xs">
                        <span className="text-xs font-semibold text-primary">{isMyMessage ? 'You' : (msg.sender.name || 'Student')}</span>
                        <span className="text-[10px] text-on-surface-variant">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm font-body whitespace-pre-line">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions & Reply Form */}
            <div className="bg-surface-container-low border-t border-outline-variant p-md">
              {selectedTicket.status === 'Resolved' ? (
                <div className="p-sm bg-surface-container text-center rounded-xl font-semibold text-sm text-on-surface-variant">
                  This support ticket is resolved and closed.
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="flex gap-sm items-center">
                  <button 
                    type="button" 
                    onClick={handleResolveTicket}
                    className="px-md py-3 border border-success/30 text-success bg-success/5 rounded-xl hover:bg-success/15 font-semibold text-xs transition-colors shrink-0"
                  >
                    Mark Resolved
                  </button>
                  <input 
                    type="text"
                    placeholder="Type response message..."
                    className="flex-1 px-sm py-3 rounded-xl border border-outline-variant bg-surface-container-lowest font-body text-sm form-input-focus"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <button 
                    type="submit"
                    className="w-10 h-10 rounded-xl bg-primary text-white hover:opacity-90 flex items-center justify-center shrink-0 shadow-md active:scale-95 transition-transform"
                  >
                    <span className="material-symbols-outlined text-md">send</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyTicketQueue;
