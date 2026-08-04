import React, { createContext, useState, useEffect, useContext } from 'react';
import API from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if session is already active
  const checkSession = async () => {
    try {
      setLoading(true);
      const res = await API.get('/auth/me');
      if (res.data && res.data.success) {
        setUser(res.data.data.user);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const login = async (loginId, password) => {
    try {
      setError(null);
      setLoading(true);
      const res = await API.post('/auth/login', { loginId, password });
      if (res.data && res.data.success) {
        setUser(res.data.data.user);
        return { success: true, user: res.data.data.user };
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed, please check your network connection';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await API.post('/auth/logout');
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await API.get('/users/profile');
      if (res.data && res.data.success) {
        setUser(res.data.data.user);
      }
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
