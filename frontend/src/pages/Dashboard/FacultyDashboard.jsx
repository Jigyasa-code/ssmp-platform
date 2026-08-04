import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../services/api';

const FacultyDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    assignedStudentsCount: 0,
    totalTicketsCount: 0,
    openTicketsCount: 0,
    inProgressTicketsCount: 0,
    resolvedTicketsCount: 0,
    avgResolutionTime: '4.2h',
    resolutionRate: '94.2%',
    satisfactionScore: '4.9/5'
  });
  const [students, setStudents] = useState([]);
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Detail Modal State
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    fetchStats();
    fetchStudents();
    fetchRecentTickets();
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

  const fetchStudents = async () => {
    try {
      const res = await API.get('/users/students');
      if (res.data && res.data.success) {
        setStudents(res.data.data.students || []);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    }
  };

  const fetchRecentTickets = async () => {
    try {
      setLoading(true);
      const res = await API.get('/tickets?limit=5');
      if (res.data && res.data.success) {
        setRecentTickets(res.data.data.tickets || []);
      }
    } catch (err) {
      console.error('Error fetching recent tickets:', err);
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
        fetchRecentTickets(); // Refresh lists
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
        fetchRecentTickets();
        fetchStats();
      }
    } catch (err) {
      alert('Failed to resolve ticket');
    }
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex">
      {/* SideNavBar */}
      <aside className="h-screen w-64 fixed left-0 top-0 bg-surface border-r border-outline-variant flex flex-col py-6 space-y-2 z-50">
        <div className="px-6 mb-8">
          <h1 className="text-headline text-2xl font-extrabold text-primary">Faculty Portal</h1>
          <p className="text-label-sm font-label font-medium text-on-surface-variant uppercase tracking-wider">Academic Support</p>
        </div>
        <nav className="flex-grow space-y-1">
          <Link to="/dashboard" className="flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-xl px-4 py-3 mx-2 scale-95 transition-transform font-bold">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="font-label text-label-md">Dashboard</span>
          </Link>
          <Link to="/ticket-queue" className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors duration-200 px-4 py-3 mx-2">
            <span className="material-symbols-outlined">forum</span>
            <span className="font-label text-label-md">Ticket Queue</span>
          </Link>
        </nav>
        <div className="px-4 mt-auto">
          <div className="p-4 bg-surface-container-low rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-primary text-3xl">account_circle</span>
              <div className="overflow-hidden">
                <p className="font-label text-label-md truncate font-semibold">{user?.name}</p>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Senior Mentor</p>
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
                placeholder="Search student records or tickets..." 
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

        {/* Main Content */}
        <main className="p-8 flex-grow custom-scrollbar overflow-y-auto">
          {/* Header Section */}
          <section className="mb-lg">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
              <div>
                <h2 className="font-headline text-3xl font-bold text-primary">Welcome, Faculty Mentor</h2>
                <p className="text-on-surface-variant mt-1 text-sm">
                  You have <span className="font-bold text-primary">{stats.assignedStudentsCount} assigned students</span> and <span className="font-bold text-secondary">{stats.openTicketsCount} open tickets</span> requiring attention.
                </p>
              </div>
              <div className="flex gap-3 text-xs">
                <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2 font-semibold bg-white/70">
                  <span className="w-3 h-3 bg-success rounded-full animate-pulse"></span>
                  <span className="text-label-md">System Active</span>
                </div>
                <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2 text-on-surface-variant font-semibold bg-white/70">
                  <span className="material-symbols-outlined text-sm">calendar_today</span>
                  <span className="text-label-md">{new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Bento Grid Layout */}
          <div className="grid grid-cols-12 gap-gutter">
            
            {/* Left side: stats & students list */}
            <div className="col-span-12 lg:col-span-4 grid grid-cols-2 gap-4 h-fit">
              {/* Avg Resolution */}
              <div className="col-span-1 bg-white border border-outline-variant rounded-xl p-md shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="material-symbols-outlined text-primary bg-primary-fixed p-2 rounded-lg">timer</span>
                  <span className="text-secondary text-xs font-bold">{stats.resolutionRate}</span>
                </div>
                <p className="text-label-sm font-label font-medium text-on-surface-variant">Avg. Resolution</p>
                <p className="text-headline text-2xl font-bold text-primary">{stats.avgResolutionTime}</p>
              </div>

              {/* Student Sat */}
              <div className="col-span-1 bg-white border border-outline-variant rounded-xl p-md shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="material-symbols-outlined text-secondary bg-secondary-container p-2 rounded-lg">thumb_up</span>
                  <span className="text-success text-xs font-bold">100% SLA</span>
                </div>
                <p className="text-label-sm font-label font-medium text-on-surface-variant">Student Sat.</p>
                <p className="text-headline text-2xl font-bold text-primary">{stats.satisfactionScore}</p>
              </div>

              {/* Assigned Students */}
              <div className="col-span-2 bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                  <h3 className="font-label text-label-md uppercase tracking-wider text-primary font-bold">Assigned Students ({students.length})</h3>
                  <button className="text-primary hover:underline text-xs font-bold">View All</button>
                </div>
                <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {students.length === 0 ? (
                    <p className="text-xs text-on-surface-variant text-center py-sm">No students assigned to your section.</p>
                  ) : (
                    students.map(stu => (
                      <div key={stu._id} className="flex items-center gap-3 group">
                        <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary-container">
                          <span className="material-symbols-outlined">person</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-label text-label-md text-on-surface truncate font-semibold">{stu.name}</p>
                          <p className="text-[10px] text-on-surface-variant truncate font-semibold">{stu.loginId} • {stu.section} ({stu.branch})</p>
                        </div>
                        <a href={`mailto:${stu.email}`} className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-primary transition-opacity">
                          <span className="material-symbols-outlined text-sm">mail</span>
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right side: recent support activity table */}
            <div className="col-span-12 lg:col-span-8 bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
                <div>
                  <h3 className="font-headline text-xl font-bold text-primary">Recent Support Tickets</h3>
                  <p className="text-label-sm font-label font-medium text-on-surface-variant">Review and reply to pending student support queries</p>
                </div>
                <div className="flex gap-2">
                  <Link to="/ticket-queue" className="px-4 py-2 bg-surface-container-low border border-outline-variant text-primary rounded-lg font-label text-label-md hover:bg-surface-container-highest transition-all flex items-center gap-2 font-semibold">
                    <span className="material-symbols-outlined text-sm">filter_list</span>
                    Open Ticket Queue
                  </Link>
                </div>
              </div>

              <div className="overflow-x-auto flex-grow">
                {loading ? (
                  <div className="p-xl text-center">
                    <div className="w-8 h-8 rounded-full border-2 border-outline-variant border-t-primary animate-spin mx-auto mb-xs"></div>
                    <span className="text-sm text-on-surface-variant font-medium">Fetching tickets list...</span>
                  </div>
                ) : recentTickets.length === 0 ? (
                  <div className="p-xl text-center">
                    <span className="material-symbols-outlined text-4xl text-outline mb-xs">done_all</span>
                    <p className="text-on-surface font-semibold text-lg">All tickets resolved!</p>
                    <p className="text-on-surface-variant text-sm mt-xs">No active support requests assigned to your queue.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant">
                        <th className="px-6 py-4 font-label text-label-md text-on-surface-variant font-semibold">Ticket ID</th>
                        <th className="px-6 py-4 font-label text-label-md text-on-surface-variant font-semibold">Student</th>
                        <th className="px-6 py-4 font-label text-label-md text-on-surface-variant font-semibold">Subject</th>
                        <th className="px-6 py-4 font-label text-label-md text-on-surface-variant font-semibold">Status</th>
                        <th className="px-6 py-4 font-label text-label-md text-on-surface-variant text-right font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {recentTickets.map(ticket => (
                        <tr 
                          key={ticket._id} 
                          onClick={() => handleOpenTicket(ticket)}
                          className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                        >
                          <td className="px-6 py-4 font-label text-label-md text-primary font-semibold">{ticket.ticketId}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary text-xs">
                                <span className="material-symbols-outlined text-sm">person</span>
                              </div>
                              <span className="font-label text-label-md font-semibold">{ticket.studentId?.name || 'Student'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-on-surface-variant text-sm truncate max-w-[200px]" title={ticket.subject}>
                            {ticket.subject}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              ticket.status === 'Open' ? 'bg-error-container text-on-error-container' :
                              ticket.status === 'In Progress' ? 'bg-secondary-container text-on-secondary-container' :
                              'bg-surface-container-highest text-on-surface-variant'
                            }`}>
                              {ticket.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-on-surface-variant font-label text-label-sm">
                            {new Date(ticket.updatedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="p-4 border-t border-outline-variant bg-surface-container-low flex justify-center">
                <Link to="/ticket-queue" className="text-label-md font-label text-primary flex items-center gap-1 hover:gap-2 transition-all font-semibold">
                  Load more ticket history
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Asymmetric Support Resource / Information Card */}
          <div className="col-span-12 bg-primary-container text-on-primary-container p-lg rounded-xl overflow-hidden relative mt-8 shadow-md">
            <div className="relative z-10 max-w-2xl">
              <h3 className="font-headline text-2xl font-bold text-white mb-2">Faculty Mentorship Best Practices</h3>
              <p className="font-body text-body-md text-white/90 mb-6">
                Ensure timely responses within 24 hours to maintain high student satisfaction scores. Use response history and templates to resolve common administrative queries while maintaining supportive university standards.
              </p>
              <div className="flex gap-4">
                <a href="#" className="bg-primary text-on-primary px-6 py-3 rounded-lg font-label text-label-md hover:opacity-90 transition-all font-semibold inline-block">
                  Review Guidelines
                </a>
                <Link to="/performance" className="bg-white/10 hover:bg-white/20 border border-white/20 px-6 py-3 rounded-lg font-label text-label-md backdrop-blur-sm transition-all font-semibold">
                  View Performance Ratings
                </Link>
              </div>
            </div>
            <div className="absolute right-0 top-0 h-full w-1/3 opacity-10 pointer-events-none flex items-center justify-center">
              <span className="material-symbols-outlined text-[200px]">school</span>
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

export default FacultyDashboard;
