import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../services/api';
import mujLogo from '../../assets/logo.png';

const FacultyPerformance = () => {
  const { user, logout } = useAuth();
  const [reportType, setReportType] = useState('individual'); // 'individual' or 'semester'
  const [facultyList, setFacultyList] = useState([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [departmentStats, setDepartmentStats] = useState({
    avgResolutionTime: '0.0h',
    resolvedTicketsCount: 0,
    resolutionRate: '0.0%',
    satisfactionScore: '4.8/5',
    totalFaculty: 0,
    totalStudents: 0,
    totalTickets: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedFacultyData, setSelectedFacultyData] = useState(null);
  const [resolvedTickets, setResolvedTickets] = useState([]);

  useEffect(() => {
    fetchDepartmentStats();
    fetchFacultyList();
  }, []);

  useEffect(() => {
    if (reportType === 'individual' && selectedFacultyId) {
      const selected = facultyList.find(f => f._id === selectedFacultyId);
      setSelectedFacultyData(selected || null);
      if (selected) {
        fetchResolvedTicketsForFaculty(selected._id);
      }
    }
  }, [selectedFacultyId, reportType, facultyList]);

  const fetchDepartmentStats = async () => {
    try {
      const res = await API.get('/users/stats');
      if (res.data && res.data.success) {
        setDepartmentStats(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching department stats:', err);
    }
  };

  const fetchFacultyList = async () => {
    try {
      setLoading(true);
      const res = await API.get('/users/faculty');
      if (res.data && res.data.success) {
        const list = res.data.data.faculty || [];
        setFacultyList(list);
        if (list.length > 0) {
          setSelectedFacultyId(list[0]._id);
        }
      }
    } catch (err) {
      console.error('Error fetching faculty list:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchResolvedTicketsForFaculty = async (mentorId) => {
    try {
      const res = await API.get('/tickets', { params: { status: 'Resolved', limit: 4 } });
      if (res.data && res.data.success) {
        // Filter resolved tickets assigned to this faculty mentor on the client side
        const allResolved = res.data.data.tickets || [];
        const filtered = allResolved.filter(t => t.mentorId?._id === mentorId);
        setResolvedTickets(filtered);
      }
    } catch (err) {
      console.error('Error fetching resolved tickets:', err);
    }
  };

  const handleExportPDF = () => {
    window.print();
  };

  // Helper to generate CSS conic gradient for a pie chart based on distribution
  const getCategoryGradient = (dist) => {
    if (!dist) return 'conic-gradient(#6750A4 0% 50%, #f47d45 50% 80%, #0a6c44 80% 100%)';
    const acad = dist.academic || 0;
    const erp = dist.erp || 0;
    const infra = dist.infra || 0;

    const limit1 = acad;
    const limit2 = acad + erp;

    return `conic-gradient(
      #6750A4 0% ${limit1}%, 
      #f47d45 ${limit1}% ${limit2}%, 
      #0a6c44 ${limit2}% 100%
    )`;
  };

  return (
    <div className="bg-background text-on-surface min-h-screen flex">
      {/* Dynamic print-friendly CSS overrides */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          aside, header, .no-print {
            display: none !important;
          }
          main {
            margin-left: 0 !important;
            padding: 0 !important;
            min-height: auto !important;
          }
          .print-header {
            display: flex !important;
          }
          .print-card {
            border: 1px solid #e0e0e0 !important;
            box-shadow: none !important;
            background: white !important;
          }
          .page-break {
            page-break-before: always;
          }
        }
      `}</style>

      {/* SideNavBar - Hidden during printing */}
      <aside className="no-print h-screen w-64 fixed left-0 top-0 bg-surface border-r border-outline-variant flex flex-col py-md z-50">
        <div className="px-md mb-xl">
          <h1 className="font-headline text-2xl font-bold text-primary">SSMP Portal</h1>
          <p className="text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Department Admin</p>
        </div>
        <nav className="flex-1 space-y-base px-sm">
          <Link to="/dashboard" className="flex items-center gap-sm px-md py-sm transition-colors duration-200 text-on-surface-variant hover:bg-surface-container-highest rounded-lg">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="font-body text-sm font-semibold">Dashboard</span>
          </Link>
          <Link to="/ticket-queue" className="flex items-center gap-sm px-md py-sm transition-colors duration-200 text-on-surface-variant hover:bg-surface-container-highest rounded-lg">
            <span className="material-symbols-outlined">confirmation_number</span>
            <span className="font-body text-sm font-semibold">Ticket Queue</span>
          </Link>
          <Link to="/performance" className="flex items-center gap-sm px-md py-sm text-secondary font-bold border-r-4 border-secondary bg-secondary-container/10 rounded-l-lg">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
            <span className="font-body text-sm">Performance</span>
          </Link>
        </nav>
        <div className="px-md mt-auto pt-md border-t border-outline-variant flex items-center gap-sm">
          <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary text-xl">
            <span className="material-symbols-outlined">account_circle</span>
          </div>
          <div>
            <p className="text-label-md font-bold text-on-surface">{user?.name}</p>
            <p className="text-label-sm text-on-surface-variant font-semibold">HOD / Administrator</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 min-h-screen flex-1 flex flex-col min-w-0">
        {/* TopAppBar - Hidden during printing */}
        <header className="no-print bg-surface border-b border-outline-variant flex justify-between items-center w-full px-lg h-16 z-40 shadow-sm">
          <div className="flex items-center gap-md w-1/2">
            <span className="font-headline text-2xl font-extrabold text-primary">SSMP Nexus</span>
          </div>
          <div className="flex items-center gap-lg">
            <h2 className="font-headline text-headline-md font-bold text-primary hidden md:block">Academic Performance</h2>
            <div className="flex items-center gap-sm">
              <button onClick={logout} className="font-label text-label-sm text-error flex items-center gap-xs px-sm py-1 border border-error/20 rounded-full hover:bg-error-container/10 transition-all font-semibold">
                <span className="material-symbols-outlined text-sm">logout</span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="pt-8 pb-12 px-lg max-w-7xl mx-auto space-y-lg flex-grow overflow-y-auto w-full">
          
          {/* Print Only Logo Header */}
          <div className="hidden print-header flex-col items-center justify-center text-center pb-6 border-b-2 border-[#f47d45] mb-8">
            <img src={mujLogo} alt="Manipal University Jaipur" className="h-16 object-contain" />
            <h1 className="text-2xl font-headline font-bold text-primary mt-2">DEPARTMENT OF ACADEMIC SUPPORT & MENTORSHIP</h1>
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mt-1">Semester Support Performance Audit Report</p>
          </div>

          {/* Report Configuration Panel - Hidden during printing */}
          <div className="no-print bg-white border border-outline-variant rounded-xl p-md shadow-sm space-y-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-sm border-b border-outline-variant pb-xs">
              <h3 className="font-headline text-lg font-bold text-primary">Performance Report Panel</h3>
              <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant">
                <button
                  onClick={() => setReportType('individual')}
                  className={`px-md py-1.5 rounded-full text-xs font-bold transition-all ${
                    reportType === 'individual' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Faculty Performance Report
                </button>
                <button
                  onClick={() => setReportType('semester')}
                  className={`px-md py-1.5 rounded-full text-xs font-bold transition-all ${
                    reportType === 'semester' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Semester Final Report (All Faculty)
                </button>
              </div>
            </div>

            {reportType === 'individual' ? (
              <div className="flex flex-col md:flex-row gap-md items-end">
                <div className="flex-1 flex flex-col space-y-xs">
                  <label className="text-xs font-bold text-primary">Select Faculty Member:</label>
                  {loading ? (
                    <div className="h-10 w-full bg-surface-container animate-pulse rounded-lg"></div>
                  ) : (
                    <select
                      className="px-sm py-2 border border-outline-variant bg-surface-container-low text-sm font-semibold rounded-xl focus:ring-2 focus:ring-primary w-full"
                      value={selectedFacultyId}
                      onChange={(e) => setSelectedFacultyId(e.target.value)}
                    >
                      {facultyList.map(f => (
                        <option key={f._id} value={f._id}>{f.name} ({f.branch || 'CSE'})</option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-xs px-md py-2.5 bg-primary text-white font-label text-sm rounded-xl hover:shadow-lg transition-all font-semibold shadow-md shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Export Faculty Report PDF
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <p className="text-xs text-on-surface-variant font-medium">This generates a consolidated performance review showing metrics and distributions for all mentored faculty members.</p>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-xs px-md py-2.5 bg-secondary text-white font-label text-sm rounded-xl hover:shadow-lg transition-all font-semibold shadow-md shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Export Semester Report PDF
                </button>
              </div>
            )}
          </div>

          {/* REPORT VIEW AREA */}
          {reportType === 'individual' ? (
            // INDIVIDUAL REPORT
            <div className="space-y-lg print-card">
              {/* Profile Overview Card */}
              {selectedFacultyData ? (
                <div className="bg-white border border-outline-variant rounded-xl p-lg print-card flex flex-col md:flex-row justify-between gap-md items-start">
                  <div>
                    <h3 className="font-headline text-2xl font-bold text-primary">{selectedFacultyData.name}</h3>
                    <p className="text-xs text-on-surface-variant font-bold mt-1">Official ID: <span className="font-mono">{selectedFacultyData.loginId}</span> | Branch: {selectedFacultyData.branch || 'CSE'}</p>
                    <p className="text-xs text-on-surface-variant font-semibold">Email: {selectedFacultyData.email}</p>
                  </div>
                  <div className="p-xs bg-primary-container/20 rounded-xl border border-primary/20 text-center min-w-[120px]">
                    <p className="text-xs font-bold text-primary">Assigned Students</p>
                    <p className="text-2xl font-display font-extrabold text-primary">{selectedFacultyData.assignedStudentsCount}</p>
                  </div>
                </div>
              ) : (
                <div className="h-24 bg-surface-container animate-pulse rounded-xl"></div>
              )}

              {/* Individual Metrics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
                <div className="bg-white border border-outline-variant rounded-xl p-md flex flex-col justify-between print-card">
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase">Resolved Tickets</span>
                  <p className="text-2xl font-bold text-primary mt-2">{selectedFacultyData?.resolvedTicketsCount || 0}</p>
                </div>
                <div className="bg-white border border-outline-variant rounded-xl p-md flex flex-col justify-between print-card">
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase">Avg Resolution Time</span>
                  <p className="text-2xl font-bold text-primary mt-2">{selectedFacultyData?.avgResolutionTime || '0.0h'}</p>
                </div>
                <div className="bg-white border border-outline-variant rounded-xl p-md flex flex-col justify-between print-card">
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase">Resolution Rate</span>
                  <p className="text-2xl font-bold text-primary mt-2">{selectedFacultyData?.resolutionRate || '0.0%'}</p>
                </div>
                <div className="bg-white border border-outline-variant rounded-xl p-md flex flex-col justify-between print-card">
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase">Satisfaction Score</span>
                  <p className="text-2xl font-bold text-primary mt-2">{selectedFacultyData?.satisfactionScore || '5.0/5'}</p>
                </div>
              </div>

              {/* Pie Charts Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                {/* Category Mix Pie Chart */}
                <div className="bg-white border border-outline-variant rounded-xl p-lg flex flex-col justify-between print-card">
                  <h4 className="font-headline text-md font-bold text-primary mb-md">Category Mix Distribution</h4>
                  <div className="flex flex-col sm:flex-row items-center gap-lg justify-around">
                    <div className="w-36 h-36 rounded-full flex items-center justify-center relative shadow-inner shrink-0" 
                      style={{
                        background: getCategoryGradient(selectedFacultyData?.categoryDistribution)
                      }}>
                      <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow">
                        <div className="text-center">
                          <p className="text-xl font-bold text-primary">{selectedFacultyData?.totalTicketsCount || 0}</p>
                          <p className="text-[9px] text-on-surface-variant font-bold uppercase">Tickets</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-sm text-xs font-semibold text-on-surface-variant w-full max-w-[180px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#6750A4] rounded-full"></span>
                          <span>Academic</span>
                        </div>
                        <span className="font-bold text-on-surface">{selectedFacultyData?.categoryDistribution?.academic || 50}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#f47d45] rounded-full"></span>
                          <span>ERP / Tech</span>
                        </div>
                        <span className="font-bold text-on-surface">{selectedFacultyData?.categoryDistribution?.erp || 30}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#0a6c44] rounded-full"></span>
                          <span>Infrastructure</span>
                        </div>
                        <span className="font-bold text-on-surface">{selectedFacultyData?.categoryDistribution?.infra || 20}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ticket Status Pie Chart */}
                <div className="bg-white border border-outline-variant rounded-xl p-lg flex flex-col justify-between print-card">
                  <h4 className="font-headline text-md font-bold text-primary mb-md">Ticket Status Breakdown</h4>
                  <div className="flex flex-col sm:flex-row items-center gap-lg justify-around">
                    <div className="w-36 h-36 rounded-full flex items-center justify-center relative shadow-inner shrink-0" 
                      style={{
                        background: 'conic-gradient(#0a6c44 0% 70%, #f47d45 70% 90%, #6750A4 90% 100%)'
                      }}>
                      <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow">
                        <div className="text-center">
                          <p className="text-xl font-bold text-primary">70%</p>
                          <p className="text-[9px] text-on-surface-variant font-bold uppercase">Resolved</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-sm text-xs font-semibold text-on-surface-variant w-full max-w-[180px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#0a6c44] rounded-full"></span>
                          <span>Resolved</span>
                        </div>
                        <span className="font-bold text-on-surface">70%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#f47d45] rounded-full"></span>
                          <span>In Progress</span>
                        </div>
                        <span className="font-bold text-on-surface">20%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#6750A4] rounded-full"></span>
                          <span>Open / Unresolved</span>
                        </div>
                        <span className="font-bold text-on-surface">10%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resolved Support Resolutions Table */}
              <div className="bg-white border border-outline-variant rounded-xl overflow-hidden print-card">
                <div className="px-lg py-md border-b border-outline-variant bg-surface-container-low">
                  <h4 className="font-headline text-md font-bold text-primary">Recent Resolved Mentorship Support Cases</h4>
                </div>
                <div className="overflow-x-auto">
                  {resolvedTickets.length === 0 ? (
                    <div className="p-lg text-center text-on-surface-variant text-sm font-semibold">
                      No resolved support cases found in history for this mentor.
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="bg-surface-container-low border-b border-outline-variant">
                        <tr className="text-xs">
                          <th className="px-lg py-sm text-on-surface-variant uppercase font-bold">Ticket ID</th>
                          <th className="px-lg py-sm text-on-surface-variant uppercase font-bold">Category</th>
                          <th className="px-lg py-sm text-on-surface-variant uppercase font-bold">Student</th>
                          <th className="px-lg py-sm text-on-surface-variant uppercase font-bold">Outcome Summary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant text-sm">
                        {resolvedTickets.map(ticket => (
                          <tr key={ticket._id}>
                            <td className="px-lg py-md font-bold text-primary">{ticket.ticketId}</td>
                            <td className="px-lg py-md">
                              <span className="px-2 py-0.5 bg-primary-fixed text-primary text-xs rounded font-semibold">{ticket.category}</span>
                            </td>
                            <td className="px-lg py-md">
                              <span className="font-semibold text-on-surface">{ticket.studentId?.name}</span>
                            </td>
                            <td className="px-lg py-md text-on-surface-variant">
                              Resolved request concerning {ticket.subject.toLowerCase()}.
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // CONSOLIDATED SEMESTER REPORT
            <div className="space-y-lg print-card">
              {/* Department Overview Summary */}
              <div className="bg-white border border-outline-variant rounded-xl p-lg print-card">
                <h3 className="font-headline text-xl font-bold text-primary">Semester Performance Overview</h3>
                <p className="text-sm text-on-surface-variant font-medium mt-1">Consolidated department-wide support stats representing all students and assigned faculty mentors.</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-md mt-md">
                  <div className="bg-surface-container rounded-xl p-sm text-center border border-outline-variant/30 print-card">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Total Faculty</p>
                    <p className="text-xl font-bold text-primary">{departmentStats.totalFaculty}</p>
                  </div>
                  <div className="bg-surface-container rounded-xl p-sm text-center border border-outline-variant/30 print-card">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Resolved Tickets</p>
                    <p className="text-xl font-bold text-primary">{departmentStats.resolvedTicketsCount}</p>
                  </div>
                  <div className="bg-surface-container rounded-xl p-sm text-center border border-outline-variant/30 print-card">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Avg Resolution Speed</p>
                    <p className="text-xl font-bold text-primary">{departmentStats.avgResolutionTime}</p>
                  </div>
                  <div className="bg-surface-container rounded-xl p-sm text-center border border-outline-variant/30 print-card">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Overall Resolution Rate</p>
                    <p className="text-xl font-bold text-primary">{departmentStats.resolutionRate}</p>
                  </div>
                </div>
              </div>

              {/* Department Distribution Pie Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                {/* Academic distribution */}
                <div className="bg-white border border-outline-variant rounded-xl p-lg flex flex-col justify-between print-card">
                  <h4 className="font-headline text-md font-bold text-primary mb-md">Academic Load Distribution</h4>
                  <div className="flex flex-col sm:flex-row items-center gap-lg justify-around">
                    <div className="w-36 h-36 rounded-full flex items-center justify-center relative shadow-inner shrink-0" 
                      style={{
                        background: 'conic-gradient(#6750A4 0% 43%, #f47d45 43% 78%, #0a6c44 78% 100%)'
                      }}>
                      <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow">
                        <span className="text-[10px] text-on-surface-variant font-bold">Load</span>
                      </div>
                    </div>
                    <div className="space-y-sm text-xs font-semibold text-on-surface-variant w-full max-w-[180px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#6750A4] rounded-full"></span>
                          <span>CSE</span>
                        </div>
                        <span className="font-bold text-on-surface">43%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#f47d45] rounded-full"></span>
                          <span>IT</span>
                        </div>
                        <span className="font-bold text-on-surface">35%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#0a6c44] rounded-full"></span>
                          <span>ECE</span>
                        </div>
                        <span className="font-bold text-on-surface">22%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category Mix */}
                <div className="bg-white border border-outline-variant rounded-xl p-lg flex flex-col justify-between print-card">
                  <h4 className="font-headline text-md font-bold text-primary mb-md">Department Ticket Categories</h4>
                  <div className="flex flex-col sm:flex-row items-center gap-lg justify-around">
                    <div className="w-36 h-36 rounded-full flex items-center justify-center relative shadow-inner shrink-0" 
                      style={{
                        background: 'conic-gradient(#6750A4 0% 55%, #f47d45 55% 85%, #0a6c44 85% 100%)'
                      }}>
                      <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow">
                        <span className="text-[10px] text-on-surface-variant font-bold">Mix</span>
                      </div>
                    </div>
                    <div className="space-y-sm text-xs font-semibold text-on-surface-variant w-full max-w-[180px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#6750A4] rounded-full"></span>
                          <span>Academic</span>
                        </div>
                        <span className="font-bold text-on-surface">55%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#f47d45] rounded-full"></span>
                          <span>ERP / Tech</span>
                        </div>
                        <span className="font-bold text-on-surface">30%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-[#0a6c44] rounded-full"></span>
                          <span>Infrastructure</span>
                        </div>
                        <span className="font-bold text-on-surface">15%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Comparative Faculty Matrix Table */}
              <div className="bg-white border border-outline-variant rounded-xl overflow-hidden print-card">
                <div className="px-lg py-md border-b border-outline-variant bg-surface-container-low">
                  <h4 className="font-headline text-md font-bold text-primary">All Faculty Mentorship Performance Grid</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container-low border-b border-outline-variant">
                      <tr className="text-xs">
                        <th className="px-md py-sm text-on-surface-variant uppercase font-bold">Faculty Name</th>
                        <th className="px-md py-sm text-on-surface-variant uppercase font-bold">Branch</th>
                        <th className="px-md py-sm text-on-surface-variant uppercase font-bold">Students</th>
                        <th className="px-md py-sm text-on-surface-variant uppercase font-bold">Resolved / Total</th>
                        <th className="px-md py-sm text-on-surface-variant uppercase font-bold">Resolution Speed</th>
                        <th className="px-md py-sm text-on-surface-variant uppercase font-bold">Resolution Rate</th>
                        <th className="px-md py-sm text-on-surface-variant uppercase font-bold">Satisfaction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant text-sm">
                      {facultyList.map(fac => (
                        <tr key={fac._id}>
                          <td className="px-md py-md font-semibold text-primary">{fac.name}</td>
                          <td className="px-md py-md">{fac.branch}</td>
                          <td className="px-md py-md font-bold">{fac.assignedStudentsCount}</td>
                          <td className="px-md py-md font-medium">{fac.resolvedTicketsCount} / {fac.totalTicketsCount}</td>
                          <td className="px-md py-md font-medium text-secondary">{fac.avgResolutionTime}</td>
                          <td className="px-md py-md font-bold">{fac.resolutionRate}</td>
                          <td className="px-md py-md text-secondary font-bold">{fac.satisfactionScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default FacultyPerformance;
