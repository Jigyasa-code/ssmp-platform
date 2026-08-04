import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import campusImg from '../../assets/image.png';

const Login = () => {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isFacultyMode, setIsFacultyMode] = useState(false);
  const [localError, setLocalError] = useState(null);
  
  const { login, user, error: authError, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    if (!loginId || !password) {
      setLocalError('Please fill in all fields');
      return;
    }
    
    const result = await login(loginId, password);
    if (result.success) {
      navigate('/dashboard');
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <main className="flex w-full min-h-screen">
      {/* Left Side: Hero Image Container */}
      <section className="hidden lg:block lg:w-3/5 xl:w-2/3 relative overflow-hidden">
        <div className="absolute inset-0 terracotta-overlay z-10"></div>
        <div className="absolute inset-0 bg-black/20 z-10"></div>
        <img 
          alt="Manipal University Jaipur Campus" 
          className="absolute inset-0 w-full h-full object-cover animate-fade-in" 
          src={campusImg}
        />
        {/* Floating Branding Overlay */}
        <div 
          className="absolute bottom-xl left-xl z-20 max-w-md p-lg rounded-xl" 
          style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.1)', 
            backdropFilter: 'blur(12px)', 
            border: '1px solid rgba(255, 255, 255, 0.2)', 
            boxShadow: 'rgba(0, 0, 0, 0.15) 0px 8px 32px 0px' 
          }}
        >
          <h1 className="font-display text-4xl font-extrabold text-white mb-sm">SSMP Portal</h1>
          <p className="font-body text-lg text-white/90">Experience academic excellence and mentorship at Manipal University Jaipur.</p>
        </div>
      </section>

      {/* Right Side: Login Form Container */}
      <section className="w-full lg:w-2/5 xl:w-1/3 flex flex-col justify-between p-lg md:p-xl shadow-2xl z-30 bg-surface-container-lowest">
        {/* Top Branding */}
        <div className="flex flex-col items-center lg:items-start space-y-sm">
          <div className="flex items-center space-x-sm">
            <div className="h-16 mb-xs">
              <img 
                alt="Manipal University Jaipur Logo" 
                className="h-full object-contain" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBE5qk7VCwMouDJV_sZXyNWv0cJl6zn9nQQQKEBhmTYdlXbx6tLmc-zoSSrBuqh1XiPNwqKLABEzDHS_deenT068EH_PNL9ItQmbu9Mnrciqm7B0DMWQlehIhcQsPG_Rzw2ymbTa3bfrsIkAUbaR2WaQV6Q3ytMn-kge6ZiYAZYKr7h5H0sTB83t2UJInr_yTFHueQWRqF77-hi4p4DiZIO6uzUrRsUGya29tskxwNwGgdEUzI880VmrPrg6Rw6lIrfcw"
              />
            </div>
          </div>
        </div>

        {/* Login Form Content */}
        <div className="max-w-md w-full mx-auto lg:mx-0 py-xl">
          <div className="mb-lg text-center lg:text-left">
            <p className="font-label text-label-md text-secondary uppercase tracking-widest mb-xs font-semibold">
              {isFacultyMode ? 'Faculty Support' : 'Welcome to SSMP Portal'}
            </p>
            <h2 className="font-headline text-3xl font-bold text-primary mb-xs">
              {isFacultyMode ? 'Faculty Sign In' : 'Student Sign In'}
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              {isFacultyMode ? 'Use your Faculty ID or HOD credentials to access the workspace.' : 'Sign in with your University Registration Number.'}
            </p>
          </div>

          <form className="space-y-md" onSubmit={handleSubmit}>
            {/* Display Errors */}
            {(localError || authError) && (
              <div className="p-sm bg-error-container text-on-error-container rounded-xl border border-error/20 text-sm font-semibold flex items-center gap-xs">
                <span className="material-symbols-outlined text-md">error</span>
                <span>{localError || authError}</span>
              </div>
            )}

            {/* Login ID field */}
            <div className="flex flex-col space-y-xs">
              <input 
                className="w-full px-sm py-sm rounded-xl border border-outline-variant bg-surface-container-low font-body text-body-md form-input-focus transition-all" 
                id="login_id" 
                type="text"
                placeholder={isFacultyMode ? "Faculty ID / Username" : "Registration Number"}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Password Field */}
            <div className="flex flex-col space-y-xs">
              <div className="relative">
                <input 
                  className="w-full px-sm py-sm rounded-xl border border-outline-variant bg-surface-container-low font-body text-body-md form-input-focus transition-all pr-12" 
                  id="password" 
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button 
                  className="absolute right-sm top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors" 
                  type="button"
                  onClick={togglePasswordVisibility}
                >
                  <span className="material-symbols-outlined">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Dual Login Actions */}
            <div className="pt-sm space-y-md">
              <div className="flex flex-col sm:flex-row gap-sm">
                {/* Student Login Button */}
                {!isFacultyMode ? (
                  <button 
                    className="flex-1 bg-primary text-white font-label py-3 rounded-full hover:opacity-90 active:scale-[0.98] transition-all shadow-md flex items-center justify-center space-x-xs font-semibold" 
                    type="submit"
                    disabled={loading}
                  >
                    <span>{loading ? 'Verifying...' : 'Sign In'}</span>
                    {!loading && <span className="material-symbols-outlined text-sm">arrow_forward</span>}
                  </button>
                ) : (
                  <button 
                    className="flex-1 bg-secondary text-white font-label py-3 rounded-full hover:opacity-90 active:scale-[0.98] transition-all shadow-md flex items-center justify-center space-x-xs font-semibold" 
                    type="submit"
                    disabled={loading}
                  >
                    <span>{loading ? 'Verifying...' : 'Faculty Sign In'}</span>
                    {!loading && <span className="material-symbols-outlined text-sm">arrow_forward</span>}
                  </button>
                )}

                {/* Toggle Mode Button */}
                <button 
                  className="flex-1 border border-outline-variant text-on-surface-variant font-label py-3 rounded-full hover:bg-surface-container-low active:scale-[0.98] transition-all flex items-center justify-center space-x-xs font-semibold" 
                  type="button"
                  onClick={() => {
                    setIsFacultyMode(!isFacultyMode);
                    setLoginId('');
                    setPassword('');
                    setLocalError(null);
                  }}
                  disabled={loading}
                >
                  <span>{isFacultyMode ? 'Student Portal' : 'Faculty Portal'}</span>
                </button>
              </div>

              <div className="flex items-center justify-center lg:justify-start">
                <a className="font-label text-label-md text-secondary hover:text-primary transition-all font-semibold" href="#">
                  Forgot Password?
                </a>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <footer className="border-t border-outline-variant pt-md mt-lg flex flex-col items-center lg:items-start text-on-surface-variant text-xs">
          <span className="font-label">University under Section 2(f) of the UGC Act</span>
          <span className="font-label mt-xs">© 2024 Manipal University Jaipur</span>
        </footer>
      </section>
    </main>
  );
};

export default Login;
