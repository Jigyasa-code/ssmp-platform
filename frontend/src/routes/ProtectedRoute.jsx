import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div class="flex items-center justify-center min-h-screen bg-background">
        <div class="flex flex-col items-center gap-xs">
          <div class="w-12 h-12 rounded-full border-4 border-outline-variant border-t-primary animate-spin"></div>
          <p class="font-label-md text-primary mt-sm animate-pulse">Loading SSMP session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
