import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../services/api';
import mujLogo from '../../assets/logo.png';

const StudentDashboard = () => {
  const { user, logout, refreshUser } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalTickets: 0, openTickets: 0, resolvedTickets: 0 });
  
  // Modals state
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  
  // Selected ticket for chat
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  
  // New ticket state
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Academic');
  const [raiseError, setRaiseError] = useState(null);

  // Security password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [securityError, setSecurityError] = useState(null);
  const [securitySuccess, setSecuritySuccess] = useState(false);

  useEffect(() => {
    fetchTickets();
    fetchStats();
    
    // Check if user is using default temp password
    if (user && !user.tempPasswordUsed) {
      setIsSecurityModalOpen(true);
    }
  }, [user]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await API.get('/tickets');
      if (res.data && res.data.success) {
        setTickets(res.data.data.tickets);
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  };

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

  const handleRaiseTicket = async (e) => {
    e.preventDefault();
    setRaiseError(null);
    if (!subject || !description) {
      setRaiseError('Subject and description are required');
      return;
    }
    
    try {
      const res = await API.post('/tickets', { subject, description, category });
      if (res.data && res.data.success) {
        setIsRaiseModalOpen(false);
        setSubject('');
        setDescription('');
        setCategory('Academic');
        fetchTickets();
        fetchStats();
      }
    } catch (err) {
      setRaiseError(err.response?.data?.message || 'Failed to raise ticket');
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
        fetchTickets(); // Refresh background list
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
      if (res.data && res.data.success) {
        setSecuritySuccess(true);
        setOldPassword('');
        setNewPassword('');
        // Update user state so warning doesn't show again
        refreshUser();
        setTimeout(() => setIsSecurityModalOpen(false), 2000);
      }
    } catch (err) {
      setSecurityError(err.response?.data?.message || 'Failed to update password');
    }
  };

  return (
    <div className="bg-background font-body text-on-background min-h-screen">
      {/* Top AppBar */}
      <header className="bg-surface border-b border-outline-variant flex justify-between items-center w-full px-margin h-20 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-md">
          <div className="flex flex-col items-start leading-none">
            <img src={mujLogo} alt="Manipal University Jaipur" className="h-10 object-contain animate-fade-in" style={{ mixBlendMode: 'multiply' }} />
            <span className="text-[9px] font-headline font-extrabold text-primary tracking-widest mt-1 uppercase">SSMP</span>
          </div>
          <div className="hidden md:flex ml-lg gap-md">
            <a className="font-label text-label-md text-primary border-b-2 border-primary py-xs font-semibold" href="#">
              Student Portal
            </a>
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <button className="p-xs rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant flex items-center">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button className="p-xs rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant flex items-center">
            <span className="material-symbols-outlined">help</span>
          </button>
          <button onClick={logout} className="font-label text-label-md text-error flex items-center gap-xs px-sm py-1 border border-error/20 rounded-full hover:bg-error-container/10 transition-all font-semibold">
            <span className="material-symbols-outlined text-sm">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-margin py-lg">
        {/* Top Orange Line separator */}
        <div className="w-full h-1 bg-[#f47d45] rounded-full mb-6"></div>

        {/* Security Warning Banner */}
        {!user?.tempPasswordUsed && (
          <section className="mb-lg p-sm bg-error-container text-on-error-container rounded-xl border border-error/30 flex justify-between items-center animate-pulse">
            <div className="flex items-center gap-sm">
              <span className="material-symbols-outlined text-xl">warning</span>
              <p className="text-sm font-semibold">You are logged in with temporary credentials. Please update your password to secure your account.</p>
            </div>
            <button onClick={() => setIsSecurityModalOpen(true)} className="px-sm py-1 bg-error text-white text-xs font-bold rounded-lg hover:opacity-90">
              Update Now
            </button>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg">
          {/* Sidebar (Left Column) */}
          <aside className="lg:col-span-4 space-y-md">
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
                <div className="flex justify-between">
                  <span className="text-on-surface-variant text-label-md">Section</span>
                  <span className="font-label text-primary font-semibold">{user?.section || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant text-label-md">Branch</span>
                  <span className="font-label text-primary font-semibold">{user?.branch || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant text-label-md">Semester</span>
                  <span className="font-label text-primary font-semibold">{user?.semester || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant text-label-md">Official Email</span>
                  <span className="font-label text-primary font-semibold truncate max-w-[200px]">{user?.email}</span>
                </div>
              </div>
            </div>

            {/* Mentor Details Widget */}
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

          {/* Main Content Area (Right Column) */}
          <section className="lg:col-span-8 space-y-lg">
            <div>
              <div className="flex items-center justify-between mb-md">
                <h2 className="font-headline text-2xl font-bold text-primary">Recent Support Tickets</h2>
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
                  <div className="p-xl text-center">
                    <div className="w-8 h-8 rounded-full border-2 border-outline-variant border-t-primary animate-spin mx-auto mb-xs"></div>
                    <span className="text-sm text-on-surface-variant font-medium">Fetching tickets list...</span>
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="p-xl text-center">
                    <span className="material-symbols-outlined text-4xl text-outline mb-xs">forum</span>
                    <p className="text-on-surface font-semibold text-lg">No active support tickets found</p>
                    <p className="text-on-surface-variant text-sm mt-xs">If you have any academic, infrastructure, or portal issues, click 'Raise New Ticket' to request support.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container border-b border-outline-variant">
                        <th className="px-md py-sm font-label text-on-surface-variant font-semibold">Ticket ID</th>
                        <th className="px-md py-sm font-label text-on-surface-variant font-semibold">Subject</th>
                        <th className="px-md py-sm font-label text-on-surface-variant font-semibold">Status</th>
                        <th className="px-md py-sm font-label text-on-surface-variant font-semibold">Last Update</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {tickets.map(ticket => (
                        <tr 
                          key={ticket._id} 
                          onClick={() => handleOpenTicket(ticket)}
                          className="hover:bg-surface-container-low transition-colors cursor-pointer"
                        >
                          <td className="px-md py-md font-label text-primary font-semibold">{ticket.ticketId}</td>
                          <td className="px-md py-md">
                            <p className="font-label text-on-surface font-semibold">{ticket.subject}</p>
                            <p className="text-xs text-on-surface-variant font-medium">{ticket.category}</p>
                          </td>
                          <td className="px-md py-md">
                            <span className={`inline-flex items-center gap-1 px-xs py-0.5 rounded text-xs font-bold uppercase ${
                              ticket.status === 'Open' ? 'bg-error-container text-on-error-container' :
                              ticket.status === 'In Progress' ? 'bg-secondary-container text-on-secondary-container' :
                              'bg-surface-container-highest text-on-surface-variant'
                            }`}>
                              {ticket.status}
                            </span>
                          </td>
                          <td className="px-md py-md text-xs text-on-surface-variant">
                            {new Date(ticket.updatedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
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

      {/* MODAL 1: Raise Ticket Modal */}
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
                <label className="text-label-md text-on-surface font-semibold" htmlFor="category">Select Support Category</label>
                <select 
                  id="category"
                  className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-body-md focus:ring-2 focus:ring-primary"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Academic">Academic (Grading, Course Appeal, Mentorship)</option>
                  <option value="ERP/Tech">ERP / Portal Login (ERP credentials, Finance portal sync)</option>
                  <option value="Infrastructure">Infrastructure (Robotics sensoring, Lab equipment)</option>
                </select>
              </div>

              <div className="flex flex-col space-y-xs">
                <label className="text-label-md text-on-surface font-semibold" htmlFor="subject">Subject</label>
                <input 
                  id="subject"
                  type="text"
                  placeholder="Summarize your issue..."
                  className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-body-md form-input-focus"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div className="flex flex-col space-y-xs">
                <label className="text-label-md text-on-surface font-semibold" htmlFor="description">Detailed Description</label>
                <textarea 
                  id="description"
                  rows="4"
                  placeholder="Provide details about your query..."
                  className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-body-md form-input-focus"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-sm pt-sm border-t border-outline-variant">
                <button 
                  type="button" 
                  onClick={() => setIsRaiseModalOpen(false)}
                  className="px-md py-xs rounded-full border border-outline-variant hover:bg-surface-container-low font-semibold text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-md py-xs rounded-full bg-primary text-white hover:opacity-90 font-semibold text-sm shadow-md"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Ticket Detail & Chat Conversation */}
      {isDetailOpen && selectedTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-sm backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl max-w-2xl w-full h-[600px] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            {/* Header */}
            <div className="bg-surface-container-low px-md py-sm border-b border-outline-variant flex justify-between items-center">
              <div>
                <span className="font-label text-xs text-primary font-bold uppercase">{selectedTicket.ticketId} • {selectedTicket.category}</span>
                <h3 className="font-headline text-lg font-bold text-on-surface truncate">{selectedTicket.subject}</h3>
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
                        <span className="text-xs font-semibold text-primary">{isMyMessage ? 'You' : (msg.sender.name || 'Mentor')}</span>
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
                    placeholder="Type message to mentor..."
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

      {/* MODAL 3: Update Default Password Modal */}
      {isSecurityModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-sm backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="bg-error-container text-on-error-container px-md py-sm border-b border-error/20 flex justify-between items-center">
              <h3 className="font-headline font-bold flex items-center gap-xs">
                <span className="material-symbols-outlined">security</span>
                <span>Security Update Required</span>
              </h3>
              {/* Only allow closing if they have already initialized password once, but wait, if it's system enforced they must fill it. Let's let them close it for flexibility */}
              <button onClick={() => setIsSecurityModalOpen(false)} className="material-symbols-outlined text-on-error-container hover:underline">close</button>
            </div>
            
            <form onSubmit={handleChangePassword} className="p-md space-y-md">
              <p className="text-sm text-on-surface-variant">
                You are currently using the default system-generated password (e.g. <code>stu_2428...</code>). To activate full portal features and clear the security warning, please set a strong custom password.
              </p>

              {securityError && (
                <div className="p-sm bg-error-container text-on-error-container rounded-xl text-xs font-semibold flex items-center gap-xs">
                  <span className="material-symbols-outlined text-sm">error</span>
                  <span>{securityError}</span>
                </div>
              )}

              {securitySuccess && (
                <div className="p-sm bg-success-container text-success rounded-xl text-xs font-semibold flex items-center gap-xs">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  <span>Password updated! Closing window...</span>
                </div>
              )}

              <div className="flex flex-col space-y-xs">
                <label className="text-xs font-semibold text-on-surface" htmlFor="oldPassword">Current Password</label>
                <input 
                  id="oldPassword"
                  type="password"
                  placeholder="Enter temporary password"
                  className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-sm form-input-focus"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  disabled={securitySuccess}
                />
              </div>

              <div className="flex flex-col space-y-xs">
                <label className="text-xs font-semibold text-on-surface" htmlFor="newPassword">New Password</label>
                <input 
                  id="newPassword"
                  type="password"
                  placeholder="Enter a new strong password"
                  className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-sm form-input-focus"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={securitySuccess}
                />
              </div>

              <div className="flex justify-end gap-sm pt-sm border-t border-outline-variant">
                <button 
                  type="button" 
                  onClick={() => setIsSecurityModalOpen(false)}
                  className="px-md py-xs rounded-full border border-outline-variant hover:bg-surface-container-low font-semibold text-xs"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-md py-xs rounded-full bg-primary text-white hover:opacity-90 font-semibold text-xs shadow-md"
                  disabled={securitySuccess}
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-xl border-t border-outline-variant bg-surface py-lg text-center">
        <p className="text-label-sm text-on-surface-variant">© 2024 Student-Mentor Management Portal. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default StudentDashboard;
