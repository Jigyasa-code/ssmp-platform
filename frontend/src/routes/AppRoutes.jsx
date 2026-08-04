import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import Login from '../pages/Login';
import Profile from '../pages/Profile';
import StudentDashboard from '../pages/Dashboard/StudentDashboard';
import FacultyDashboard from '../pages/Dashboard/FacultyDashboard';
import FacultyTicketQueue from '../pages/Dashboard/FacultyTicketQueue';
import FacultyPerformance from '../pages/Dashboard/FacultyPerformance';
import HODDashboard from '../pages/Dashboard/HODDashboard';
import { useAuth } from '../context/AuthContext';

// Dynamic Router to resolve Dashboard based on User Role
const DashboardRouter = () => {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentDashboard />;
  if (user?.role === 'faculty') return <FacultyDashboard />;
  if (user?.role === 'hod') return <HODDashboard />;
  return <Navigate to="/login" replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      {/* Protected Routes */}
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <DashboardRouter />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/ticket-queue" 
        element={
          <ProtectedRoute allowedRoles={['faculty', 'hod']}>
            <FacultyTicketQueue />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/performance" 
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <FacultyPerformance />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } 
      />

      {/* Fallbacks */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default AppRoutes;
