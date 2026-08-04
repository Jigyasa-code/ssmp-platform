import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../services/api';

const HODDashboard = () => {
  const { user, logout } = useAuth();
  
  // Stepper State
  const [currentStep, setCurrentStep] = useState(1);
  const [semesterInfo, setSemesterInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  
  // Form values
  const [academicYear, setAcademicYear] = useState('2024-25');
  const [term, setTerm] = useState('Odd');
  
  // File data results
  const [facultyFile, setFacultyFile] = useState(null);
  const [studentFile, setStudentFile] = useState(null);
  const [facultyPreview, setFacultyPreview] = useState([]);
  const [facultyCount, setFacultyCount] = useState(0);
  const [studentPreview, setStudentPreview] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  
  // Validation details
  const [warnings, setWarnings] = useState([]);
  const [isValidated, setIsValidated] = useState(false);
  
  // Final Results
  const [onboardingResults, setOnboardingResults] = useState(null);

  // Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalFaculty: 0,
    totalTickets: 0,
    resolvedTickets: 0
  });

  useEffect(() => {
    fetchCurrentSetup();
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

  const fetchCurrentSetup = async () => {
    try {
      setLoading(true);
      const res = await API.get('/semester/current');
      if (res.data && res.data.success && res.data.data.semester) {
        const sem = res.data.data.semester;
        setSemesterInfo(sem);
        setCurrentStep(sem.currentStep);
        setAcademicYear(sem.academicYear);
        setTerm(sem.term);
        setFacultyCount(sem.facultyData?.length || 0);
        setFacultyPreview(sem.facultyData?.slice(0, 5) || []);
        setStudentCount(sem.studentData?.length || 0);
        setStudentPreview(sem.studentData?.slice(0, 5) || []);
      }
    } catch (err) {
      console.error('Error fetching current setup:', err);
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Start Initialization
  const handleStartInit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      setLoading(true);
      const res = await API.post('/semester/init', { academicYear, term });
      if (res.data && res.data.success) {
        setSemesterInfo(res.data.data.semester);
        setCurrentStep(2);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to start semester initialization');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Upload Faculty Sheet
  const handleFacultyUpload = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!facultyFile) {
      setErrorMessage('Please select a CSV or Excel file to upload');
      return;
    }

    const formData = new FormData();
    formData.append('file', facultyFile);

    try {
      setLoading(true);
      const res = await API.post('/semester/upload-faculty', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      if (res.data && res.data.success) {
        setFacultyCount(res.data.data.count);
        setFacultyPreview(res.data.data.sample);
        setCurrentStep(3);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Faculty list upload failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Upload Student Sheet
  const handleStudentUpload = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!studentFile) {
      setErrorMessage('Please select a CSV or Excel file to upload');
      return;
    }

    const formData = new FormData();
    formData.append('file', studentFile);

    try {
      setLoading(true);
      const res = await API.post('/semester/upload-student', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      if (res.data && res.data.success) {
        setStudentCount(res.data.data.count);
        setStudentPreview(res.data.data.sample);
        setCurrentStep(4);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Student list upload failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Run Validation
  const handleRunValidation = async () => {
    setErrorMessage(null);
    try {
      setLoading(true);
      const res = await API.get('/semester/validate');
      if (res.data && res.data.success) {
        setWarnings(res.data.data.warnings || []);
        setIsValidated(true);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Validation execution failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 5: Finalize & Generate Credentials
  const handleFinalizeSetup = async () => {
    setErrorMessage(null);
    try {
      setLoading(true);
      const res = await API.post('/semester/finalize');
      if (res.data && res.data.success) {
        setOnboardingResults(res.data.data);
        setCurrentStep(5);
        fetchStats();
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Finalization account creation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetWizard = () => {
    setCurrentStep(1);
    setSemesterInfo(null);
    setFacultyFile(null);
    setStudentFile(null);
    setFacultyPreview([]);
    setStudentPreview([]);
    setWarnings([]);
    setIsValidated(false);
    setOnboardingResults(null);
  };

  return (
    <div className="bg-background font-body text-on-background min-h-screen">
      {/* Top Navigation Bar */}
      <header className="bg-surface sticky top-0 z-50 flex justify-between items-center w-full px-margin h-16 border-b border-outline-variant shadow-sm">
        <div className="flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary text-3xl">school</span>
          <h1 className="font-headline text-headline-md font-bold text-primary">SSMP Portal</h1>
        </div>
        <div className="flex items-center gap-sm">
          <button className="material-symbols-outlined text-on-surface-variant p-xs hover:bg-surface-container-high rounded-full transition-colors">notifications</button>
          <button className="material-symbols-outlined text-on-surface-variant p-xs hover:bg-surface-container-high rounded-full transition-colors">settings</button>
          <button onClick={logout} className="font-label text-label-sm text-error flex items-center gap-xs px-sm py-1 border border-error/20 rounded-full hover:bg-error-container/10 transition-all font-semibold">
            <span className="material-symbols-outlined text-sm">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="hidden md:flex flex-col h-[calc(100vh-64px)] w-64 fixed left-0 bg-surface-container-low border-r border-outline-variant py-md px-sm space-y-xs">
          <div className="px-sm mb-lg">
            <p className="font-label text-xs text-on-surface-variant opacity-70">Academic Year {academicYear}</p>
            <h2 className="font-headline text-primary font-bold">SSMP Admin</h2>
          </div>
          <nav className="flex-1 space-y-1">
            <Link to="/dashboard" className="flex items-center gap-sm px-sm py-md text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-all">
              <span className="material-symbols-outlined">dashboard</span>
              <span className="font-label text-sm">Dashboard</span>
            </Link>
            <Link to="/ticket-queue" className="flex items-center gap-sm px-sm py-md text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-all">
              <span className="material-symbols-outlined">confirmation_number</span>
              <span className="font-label text-sm">Ticket Queue</span>
            </Link>
            <Link to="/performance" className="flex items-center gap-sm px-sm py-md text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-all">
              <span className="material-symbols-outlined">leaderboard</span>
              <span className="font-label text-sm">Performance</span>
            </Link>
            <Link to="/dashboard" className="flex items-center gap-sm px-sm py-md bg-primary-container text-on-primary-container rounded-lg font-bold shadow-sm">
              <span className="material-symbols-outlined">admin_panel_settings</span>
              <span className="font-label text-sm">System Onboarding</span>
            </Link>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 md:ml-64 p-margin min-h-screen">
          {/* Header Section */}
          <div className="mb-lg flex flex-col md:flex-row md:items-end justify-between gap-md border-b border-outline-variant pb-md">
            <div>
              <nav className="flex items-center gap-xs text-on-surface-variant mb-xs text-xs font-semibold">
                <span>Admin</span>
                <span className="material-symbols-outlined text-sm">chevron_right</span>
                <span className="text-primary font-bold">Semester Onboarding</span>
              </nav>
              <h2 className="font-headline text-3xl font-bold text-primary">Initialize Academic Semester</h2>
              <p className="text-sm text-on-surface-variant max-w-2xl mt-1">
                Onboard students and faculty for the new academic cycle. This workflow automatically distributes students to mentors in a round-robin assignment.
              </p>
            </div>
            {currentStep === 1 && (
              <button 
                onClick={handleResetWizard}
                className="flex items-center gap-xs px-lg py-md bg-primary text-white rounded-full font-label text-sm hover:opacity-90 transition-opacity shadow-lg font-semibold"
              >
                <span className="material-symbols-outlined text-sm">rocket_launch</span>
                Initialize Semester
              </button>
            )}
          </div>

          {/* Workflow Stepper */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-base mb-xl">
            {/* Step 1: Init details */}
            <div className={`flex flex-col items-center p-sm border-2 rounded-xl transition-all ${
              currentStep === 1 ? 'bg-primary-container/10 border-primary' : 'bg-white border-outline-variant opacity-60'
            }`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-xs font-bold text-lg ${
                currentStep > 1 ? 'bg-secondary text-on-secondary' : 'bg-primary text-on-primary'
              }`}>
                {currentStep > 1 ? <span className="material-symbols-outlined text-sm">check</span> : '1'}
              </div>
              <p className="font-label text-xs text-center font-bold">Set Semester Info</p>
            </div>

            {/* Step 2: Upload Faculty */}
            <div className={`flex flex-col items-center p-sm border transition-all ${
              currentStep === 2 ? 'bg-primary-container/10 border-primary border-2' : 'bg-white border-outline-variant'
            } ${currentStep < 2 ? 'opacity-40' : ''}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-xs font-bold text-lg ${
                currentStep > 2 ? 'bg-secondary text-on-secondary' : 'bg-surface-container-highest text-on-surface-variant'
              }`}>
                {currentStep > 2 ? <span className="material-symbols-outlined text-sm">check</span> : '2'}
              </div>
              <p className="font-label text-xs text-center font-bold">Faculty Upload</p>
            </div>

            {/* Step 3: Upload Student */}
            <div className={`flex flex-col items-center p-sm border transition-all ${
              currentStep === 3 ? 'bg-primary-container/10 border-primary border-2' : 'bg-white border-outline-variant'
            } ${currentStep < 3 ? 'opacity-40' : ''}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-xs font-bold text-lg ${
                currentStep > 3 ? 'bg-secondary text-on-secondary' : 'bg-surface-container-highest text-on-surface-variant'
              }`}>
                {currentStep > 3 ? <span className="material-symbols-outlined text-sm">check</span> : '3'}
              </div>
              <p className="font-label text-xs text-center font-bold">Student Upload</p>
            </div>

            {/* Step 4: Validation */}
            <div className={`flex flex-col items-center p-sm border transition-all ${
              currentStep === 4 ? 'bg-primary-container/10 border-primary border-2' : 'bg-white border-outline-variant'
            } ${currentStep < 4 ? 'opacity-40' : ''}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-xs font-bold text-lg ${
                currentStep > 4 ? 'bg-secondary text-on-secondary' : 'bg-surface-container-highest text-on-surface-variant'
              }`}>
                {currentStep > 4 ? <span className="material-symbols-outlined text-sm">check</span> : '4'}
              </div>
              <p className="font-label text-xs text-center font-bold">Anomalies Check</p>
            </div>

            {/* Step 5: Onboarded */}
            <div className={`flex flex-col items-center p-sm border transition-all ${
              currentStep === 5 ? 'bg-primary-container/10 border-primary border-2' : 'bg-white border-outline-variant'
            } ${currentStep < 5 ? 'opacity-40' : ''}`}>
              <div className="w-10 h-10 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center mb-xs font-bold text-lg">5</div>
              <p className="font-label text-xs text-center font-bold">Credentials Issued</p>
            </div>
          </div>

          {/* Display general errors */}
          {errorMessage && (
            <div className="mb-lg p-sm bg-error-container text-on-error-container rounded-xl border border-error/20 text-sm font-semibold flex items-center gap-xs">
              <span className="material-symbols-outlined text-md">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Interactive Bento Wizard Panel */}
          <div className="grid grid-cols-12 gap-lg">
            
            {/* WIZARD CONTENT - Steps details */}
            <div className="col-span-12 lg:col-span-8">
              
              {/* STEP 1 PANEL: Term configuration */}
              {currentStep === 1 && (
                <div className="bg-white rounded-xl border border-outline-variant p-md shadow-sm">
                  <h3 className="font-headline text-lg font-bold text-primary mb-md">Configure Term Details</h3>
                  <form onSubmit={handleStartInit} className="space-y-md">
                    <div className="flex flex-col space-y-xs">
                      <label className="text-sm font-semibold text-on-surface">Academic Year</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 2024-25"
                        className="px-sm py-xs border border-outline-variant rounded-xl bg-surface-container-low font-body text-sm form-input-focus"
                        value={academicYear}
                        onChange={(e) => setAcademicYear(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex flex-col space-y-xs">
                      <label className="text-sm font-semibold text-on-surface">Term Phase</label>
                      <select 
                        className="px-sm py-xs border border-outline-variant rounded-xl bg-surface-container-low font-body text-sm focus:ring-2 focus:ring-primary"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                      >
                        <option value="Odd">Odd Semester (July - Dec)</option>
                        <option value="Even">Even Semester (Jan - June)</option>
                      </select>
                    </div>

                    <button 
                      type="submit"
                      className="px-lg py-3 bg-primary text-white font-semibold text-sm rounded-full hover:opacity-90"
                      disabled={loading}
                    >
                      {loading ? 'Initializing...' : 'Next: Upload Faculty details'}
                    </button>
                  </form>
                </div>
              )}

              {/* STEP 2 PANEL: Faculty Upload */}
              {currentStep === 2 && (
                <div className="bg-white rounded-xl border border-outline-variant p-md shadow-sm">
                  <div className="flex justify-between items-center mb-md border-b border-outline-variant pb-xs">
                    <h3 className="font-headline text-lg font-bold text-primary">Upload Faculty Spreadsheet</h3>
                    <a href="#" className="text-primary font-semibold text-xs hover:underline">Download Templates</a>
                  </div>

                  <form onSubmit={handleFacultyUpload} className="space-y-md">
                    <div className="flex items-center gap-sm p-lg bg-surface-container border border-dashed border-outline rounded-lg text-center justify-center flex-col">
                      <span className="material-symbols-outlined text-4xl text-primary animate-bounce">upload_file</span>
                      <div>
                        <p className="font-bold text-primary">Select Faculty excel (.xlsx, .xls) or CSV file</p>
                        <p className="text-xs text-on-surface-variant mt-xs">Required Headers: Faculty ID, Name, Dept, Email</p>
                      </div>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                            alert('Please select an Excel file (.xlsx or .xls) only. CSV files are not allowed.');
                            e.target.value = null;
                            setFacultyFile(null);
                          } else {
                            setFacultyFile(file);
                          }
                        }}
                        className="block text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                      />
                      {facultyFile && (
                        <p className="text-xs text-success font-semibold flex items-center gap-xs mt-xs">
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Selected file: {facultyFile.name}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-sm justify-between pt-sm">
                      <button 
                        type="button" 
                        onClick={handleResetWizard} 
                        className="px-md py-xs border border-outline-variant hover:bg-surface-container-low font-semibold text-xs rounded-full"
                      >
                        Reset Setup
                      </button>
                      <button 
                        type="submit" 
                        className="px-lg py-3 bg-primary text-white font-semibold text-sm rounded-full hover:opacity-90"
                        disabled={loading}
                      >
                        {loading ? 'Uploading...' : 'Upload Faculty sheet'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* STEP 3 PANEL: Student Upload */}
              {currentStep === 3 && (
                <div className="bg-white rounded-xl border border-outline-variant p-md shadow-sm">
                  <div className="flex justify-between items-center mb-md border-b border-outline-variant pb-xs">
                    <h3 className="font-headline text-lg font-bold text-primary">Upload Student Spreadsheet</h3>
                    <div>
                      <span className="text-xs text-on-surface-variant font-bold">({facultyCount} Faculty accounts parsed)</span>
                    </div>
                  </div>

                  <form onSubmit={handleStudentUpload} className="space-y-md">
                    <div className="flex items-center gap-sm p-lg bg-surface-container border border-dashed border-outline rounded-lg text-center justify-center flex-col">
                      <span className="material-symbols-outlined text-4xl text-primary animate-bounce">upload_file</span>
                      <div>
                        <p className="font-bold text-primary">Select Student excel (.xlsx, .xls) or CSV file</p>
                        <p className="text-xs text-on-surface-variant mt-xs">Required Headers: Reg. No, Student Name, Section, Branch, Email</p>
                      </div>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                            alert('Please select an Excel file (.xlsx or .xls) only. CSV files are not allowed.');
                            e.target.value = null;
                            setStudentFile(null);
                          } else {
                            setStudentFile(file);
                          }
                        }}
                        className="block text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                      />
                      {studentFile && (
                        <p className="text-xs text-success font-semibold flex items-center gap-xs mt-xs">
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Selected file: {studentFile.name}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-sm justify-between pt-sm">
                      <button 
                        type="button" 
                        onClick={() => setCurrentStep(2)}
                        className="px-md py-xs border border-outline-variant hover:bg-surface-container-low font-semibold text-xs rounded-full"
                      >
                        Back to step 2
                      </button>
                      <button 
                        type="submit" 
                        className="px-lg py-3 bg-primary text-white font-semibold text-sm rounded-full hover:opacity-90"
                        disabled={loading}
                      >
                        {loading ? 'Uploading...' : 'Upload Student sheet'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* STEP 4 PANEL: Validation check */}
              {currentStep === 4 && (
                <div className="bg-white rounded-xl border border-outline-variant p-md shadow-sm space-y-md">
                  <h3 className="font-headline text-lg font-bold text-primary">Data Validation and Anomalies check</h3>
                  <p className="text-sm text-on-surface-variant">
                    Run system validation on the uploaded dataset. This will audit both files for duplicate IDs, overlapping official emails, and verify database collisions.
                  </p>

                  <div className="p-sm bg-surface-container rounded-xl flex items-center justify-between border border-outline-variant text-sm">
                    <div>
                      <p className="font-bold text-primary">Ready to run validation audit</p>
                      <p className="text-xs text-on-surface-variant font-medium">Dataset sizes: {facultyCount} Faculty, {studentCount} Students</p>
                    </div>
                    <button 
                      onClick={handleRunValidation}
                      className="px-md py-xs bg-secondary text-white font-semibold text-xs rounded-lg hover:opacity-90 shadow"
                      disabled={loading}
                    >
                      {loading ? 'Auditing...' : 'Run Validation'}
                    </button>
                  </div>

                  {isValidated && (
                    <div className="space-y-sm">
                      <h4 className="font-headline text-md font-bold text-on-surface">Validation results:</h4>
                      {warnings.length === 0 ? (
                        <div className="p-sm bg-success/10 text-success border border-success/30 rounded-xl text-xs font-semibold flex items-center gap-xs">
                          <span className="material-symbols-outlined">check_circle</span>
                          <span>Validation passed successfully! No duplication or db conflict warnings found in this dataset.</span>
                        </div>
                      ) : (
                        <div className="p-sm bg-error-container text-on-error-container border border-error/30 rounded-xl space-y-xs text-xs font-semibold">
                          <p className="font-bold flex items-center gap-xs">
                            <span className="material-symbols-outlined text-sm">warning</span>
                            <span>Conflicts flagged inside uploaded lists:</span>
                          </p>
                          <ul className="list-disc pl-sm space-y-[2px]">
                            {warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                          </ul>
                          <p className="text-[10px] opacity-80 pt-xs">Note: Finalizing despite overlaps will overwrite database accounts corresponding to those keys.</p>
                        </div>
                      )}

                      <div className="flex gap-sm justify-between pt-sm">
                        <button 
                          onClick={() => setCurrentStep(3)}
                          className="px-md py-xs border border-outline-variant hover:bg-surface-container-low font-semibold text-xs rounded-full"
                        >
                          Back to Step 3
                        </button>
                        <button 
                          onClick={handleFinalizeSetup}
                          className="px-lg py-3 bg-primary text-white font-semibold text-sm rounded-full hover:opacity-90 shadow-md"
                          disabled={loading}
                        >
                          {loading ? 'Creating accounts...' : 'Finalize & Generate Credentials'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 5 PANEL: Finished & Password list */}
              {currentStep === 5 && onboardingResults && (
                <div className="bg-white rounded-xl border border-outline-variant p-md shadow-sm space-y-md">
                  <div className="p-md bg-success/10 border border-success/30 text-success text-center rounded-xl">
                    <span className="material-symbols-outlined text-4xl mb-xs">verified_user</span>
                    <h3 className="font-headline text-lg font-bold">Academic Onboarding Complete!</h3>
                    <p className="text-xs text-on-surface-variant font-medium mt-xs">
                      Academic Year {onboardingResults.academicYear} ({onboardingResults.term} Sem) is initialized.
                    </p>
                  </div>

                  <div className="space-y-sm">
                    <div className="flex justify-between items-center bg-surface-container px-sm py-2 rounded-xl text-xs font-bold">
                      <span>Faculty Accounts Created: {onboardingResults.facultyCount}</span>
                      <span>Student Accounts Created: {onboardingResults.studentCount}</span>
                    </div>

                    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-sm">
                      <p className="text-xs font-bold text-primary mb-sm">Temporary Onboarding Credentials Generated:</p>
                      <div className="max-h-[200px] overflow-y-auto custom-scrollbar text-xs font-mono divide-y divide-outline-variant">
                        {onboardingResults.facultyCredentials?.map(f => (
                          <div key={f.id} className="py-1 flex justify-between">
                            <span>Faculty: {f.name} ({f.id})</span>
                            <span className="font-bold text-secondary">Temp PW: {f.tempPassword}</span>
                          </div>
                        ))}
                        {onboardingResults.studentCredentials?.slice(0, 10).map(s => (
                          <div key={s.regNo} className="py-1 flex justify-between">
                            <span>Student: {s.name} ({s.regNo})</span>
                            <span className="font-bold text-secondary">Temp PW: {s.tempPassword}</span>
                          </div>
                        ))}
                        {onboardingResults.studentCredentials?.length > 10 && (
                          <p className="text-center text-[10px] text-on-surface-variant pt-xs">... and {onboardingResults.studentCredentials.length - 10} more student records. Credentials dispatched to official student emails.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleResetWizard}
                    className="px-lg py-3 bg-secondary text-white font-semibold text-sm rounded-full hover:opacity-90 w-full"
                  >
                    Reset Onboarding Wizard
                  </button>
                </div>
              )}

            </div>

            {/* Bento details preview columns */}
            <div className="col-span-12 lg:col-span-4 space-y-md">
              
              {/* Parse Preview Box */}
              {currentStep > 1 && currentStep < 5 && (
                <div className="bg-white rounded-xl border border-outline-variant p-md shadow-sm">
                  <h4 className="font-headline text-sm font-bold text-primary mb-sm flex items-center gap-xs">
                    <span className="material-symbols-outlined text-lg">analytics</span>
                    <span>Upload Status Panel</span>
                  </h4>
                  <div className="space-y-sm text-xs font-medium text-on-surface-variant">
                    <div className="flex justify-between">
                      <span>Faculty File Uploaded:</span>
                      <span className={facultyCount > 0 ? 'text-success font-bold' : 'text-error'}>
                        {facultyCount > 0 ? `Yes (${facultyCount} items)` : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Student File Uploaded:</span>
                      <span className={studentCount > 0 ? 'text-success font-bold' : 'text-error'}>
                        {studentCount > 0 ? `Yes (${studentCount} items)` : 'No'}
                      </span>
                    </div>
                    
                    {facultyPreview.length > 0 && (
                      <div className="border-t border-outline-variant pt-xs mt-xs">
                        <p className="font-bold text-primary mb-xs">Faculty Preview:</p>
                        <ul className="space-y-xs list-disc pl-sm font-sans">
                          {facultyPreview.map((f, i) => (
                            <li key={i} className="truncate">{f.name} ({f.dept})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {studentPreview.length > 0 && (
                      <div className="border-t border-outline-variant pt-xs mt-xs">
                        <p className="font-bold text-primary mb-xs">Student Preview:</p>
                        <ul className="space-y-xs list-disc pl-sm font-sans">
                          {studentPreview.map((s, i) => (
                            <li key={i} className="truncate">{s.name} ({s.branch} • Sec {s.section})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic stats load distribution */}
              <div className="bg-white rounded-xl border border-outline-variant p-md shadow-sm">
                <div className="flex justify-between items-center mb-md">
                  <h3 className="font-headline text-md font-bold text-primary">Academic Distribution Load</h3>
                  <div className="flex items-center gap-xs text-[10px] font-bold text-secondary uppercase">
                    <span className="h-2 w-2 rounded-full bg-secondary animate-status-dot"></span>
                    <span>Live status</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-xs mb-sm">
                  <div className="bg-surface-container rounded-xl p-xs text-center border border-outline-variant/30">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Students</p>
                    <p className="text-lg font-bold text-primary">{stats.totalStudents}</p>
                  </div>
                  <div className="bg-surface-container rounded-xl p-xs text-center border border-outline-variant/30">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Faculty</p>
                    <p className="text-lg font-bold text-primary">{stats.totalFaculty}</p>
                  </div>
                  <div className="bg-surface-container rounded-xl p-xs text-center border border-outline-variant/30">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Tickets</p>
                    <p className="text-lg font-bold text-primary">{stats.totalTickets}</p>
                  </div>
                </div>

                <div className="flex items-center gap-sm pt-sm justify-between border-t border-outline-variant">
                  <div className="w-24 h-24 rounded-full flex items-center justify-center relative shadow-inner shrink-0" 
                    style={{
                      background: 'conic-gradient(#6750A4 0% 43%, #f47d45 43% 78%, #0a6c44 78% 100%)'
                    }}>
                    <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow">
                      <span className="text-[10px] text-on-surface-variant font-bold">Load</span>
                    </div>
                  </div>
                  <div className="flex-grow space-y-1 text-[11px] font-semibold text-on-surface-variant">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-[#6750A4] rounded-full"></span>
                        <span>CSE</span>
                      </div>
                      <span className="font-bold text-on-surface">43%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-[#f47d45] rounded-full"></span>
                        <span>IT</span>
                      </div>
                      <span className="font-bold text-on-surface">35%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-[#0a6c44] rounded-full"></span>
                        <span>ECE</span>
                      </div>
                      <span className="font-bold text-on-surface">22%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default HODDashboard;
