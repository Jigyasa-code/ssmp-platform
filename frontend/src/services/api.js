import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true, // Crucial for reading and writing HttpOnly session cookies
  headers: {
    'Content-Type': 'application/json'
  }
});

// Response interceptor to handle authorization errors globally
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired or not logged in, redirect to login page (if not already there)
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default API;
