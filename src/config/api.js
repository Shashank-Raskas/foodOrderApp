// API Configuration
// Smart URL detection: For cloud deployments, backend is on same base domain

const getAPIUrl = () => {
  // If environment variable is explicitly set, use it
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL !== 'undefined') {
    return import.meta.env.VITE_API_URL;
  }

  // For localhost development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  // For cloud deployment - build backend URL from frontend URL
  // If frontend is at: https://foodorderapp-99re.onrender.com
  // Backend should be at: https://orderapp-backend-czwe.onrender.com (same base Render domain)
  
  // This assumes your backend Render service is: orderapp-backend-czwe
  // Adjust the subdomain to match your actual backend service name
  const protocol = window.location.protocol; // https: or http:
  const host = window.location.host; // foodorderapp-99re.onrender.com
  
  // Replace frontend service name with backend service name
  // Adjust 'orderapp-backend-czwe' to match your actual backend service name
  const backendHost = host.replace('foodorderapp-99re', 'orderapp-backend-czwe');
  
  return `${protocol}//${backendHost}`;
};

export const API_URL = getAPIUrl();

export const API_ENDPOINTS = {
  MEALS: `${API_URL}/meals`,
  ORDERS: `${API_URL}/orders`,
};
