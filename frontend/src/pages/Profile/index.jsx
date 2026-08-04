import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../services/api';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!oldPassword || !newPassword) {
      setError('Please fill in both fields');
      return;
    }

    try {
      setLoading(true);
      const res = await API.put('/auth/update-password', { oldPassword, newPassword });
      if (res.data && res.data.success) {
        setSuccess(true);
        setOldPassword('');
        setNewPassword('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background text-on-surface min-h-screen">
      {/* Top AppBar */}
      <header className="bg-surface border-b border-outline-variant flex justify-between items-center w-full px-margin h-16 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-sm">
          <Link to="/dashboard" className="font-headline text-headline-md font-bold text-primary hover:opacity-85">
            SSMP Portal
          </Link>
          <div className="hidden md:flex ml-lg gap-md text-xs font-bold text-on-surface-variant uppercase">
            <span>/ Profile Settings</span>
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <Link to="/dashboard" className="font-label text-label-md text-primary flex items-center gap-xs px-sm py-1 border border-primary/20 rounded-full hover:bg-primary/5 transition-all font-semibold">
            <span className="material-symbols-outlined text-sm">dashboard</span>
            <span>Dashboard</span>
          </Link>
          <button onClick={logout} className="font-label text-label-md text-error flex items-center gap-xs px-sm py-1 border border-error/20 rounded-full hover:bg-error-container/10 transition-all font-semibold">
            <span className="material-symbols-outlined text-sm">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-margin py-lg space-y-lg">
        <div className="bg-white rounded-xl border border-outline-variant p-lg shadow-sm">
          <h2 className="font-headline text-2xl font-bold text-primary mb-md">Account Settings</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg border-b border-outline-variant pb-lg mb-lg text-sm">
            <div>
              <p className="font-label text-on-surface-variant font-bold text-xs uppercase tracking-wider">Full Name</p>
              <p className="font-headline text-lg font-bold text-on-surface mt-xs">{user?.name}</p>
            </div>
            <div>
              <p className="font-label text-on-surface-variant font-bold text-xs uppercase tracking-wider">Official Email</p>
              <p className="font-headline text-lg font-bold text-on-surface mt-xs">{user?.email}</p>
            </div>
            <div>
              <p className="font-label text-on-surface-variant font-bold text-xs uppercase tracking-wider">
                {user?.role === 'student' ? 'Registration Number' : 'Faculty ID'}
              </p>
              <p className="font-headline text-lg font-bold text-on-surface mt-xs">{user?.loginId}</p>
            </div>
            <div>
              <p className="font-label text-on-surface-variant font-bold text-xs uppercase tracking-wider">Role Access</p>
              <p className="font-headline text-lg font-bold text-primary mt-xs uppercase">{user?.role}</p>
            </div>
            {user?.role === 'student' && (
              <>
                <div>
                  <p className="font-label text-on-surface-variant font-bold text-xs uppercase tracking-wider">Section & Class</p>
                  <p className="font-headline text-lg font-bold text-on-surface mt-xs">{user?.section || 'N/A'}</p>
                </div>
                <div>
                  <p className="font-label text-on-surface-variant font-bold text-xs uppercase tracking-wider">Branch</p>
                  <p className="font-headline text-lg font-bold text-on-surface mt-xs">{user?.branch || 'N/A'}</p>
                </div>
              </>
            )}
          </div>

          <h3 className="font-headline text-lg font-bold text-primary mb-md">Security Update</h3>
          <form onSubmit={handleUpdatePassword} className="max-w-md space-y-md">
            {error && (
              <div className="p-sm bg-error-container text-on-error-container rounded-xl text-xs font-semibold flex items-center gap-xs">
                <span className="material-symbols-outlined text-sm">error</span>
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-sm bg-success/10 text-success border border-success/30 rounded-xl text-xs font-semibold flex items-center gap-xs">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>Your password has been updated successfully!</span>
              </div>
            )}

            <div className="flex flex-col space-y-xs">
              <label className="text-xs font-semibold text-on-surface" htmlFor="oldPassword">Current Password</label>
              <input 
                id="oldPassword"
                type="password"
                placeholder="Enter current password"
                className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-sm form-input-focus"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="flex flex-col space-y-xs">
              <label className="text-xs font-semibold text-on-surface" htmlFor="newPassword">New Password</label>
              <input 
                id="newPassword"
                type="password"
                placeholder="Enter new strong password"
                className="w-full px-sm py-xs rounded-xl border border-outline-variant bg-surface-container-low font-body text-sm form-input-focus"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button 
              type="submit"
              className="px-lg py-3 bg-primary text-white font-semibold text-sm rounded-full hover:opacity-90 shadow-md transition-all"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Profile;
