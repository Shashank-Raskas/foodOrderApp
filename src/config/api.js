// API Configuration - Runtime-based detection
// This runs in the browser, so it always detects the correct environment

const determineAPIUrl = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Debug log to verify which URL is being used
  console.log(`[API Config] Current hostname: ${hostname}`);
  
  // Local development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const url = 'http://localhost:3000';
    console.log(`[API Config] Using LOCAL backend: ${url}`);
    return url;
  }
  
  // Cloud deployment - Render
  if (hostname.includes('onrender.com')) {
    // Your service mapping:
    // Frontend: foodorderapp-99re.onrender.com
    // Backend: orderapp-backend-czwe.onrender.com
    
    // IMPORTANT: If your service names are different, update this mapping!
    // Format: replace(oldServiceName, newServiceName)
    const backendHostname = hostname.replace('foodorderapp-99re', 'orderapp-backend-czwe');
    const url = `${protocol}//${backendHostname}`;
    console.log(`[API Config] Using CLOUD backend: ${url}`);
    return url;
  }
  
  // Other domains (Netlify, Vercel, custom domain, etc.)
  // Fallback to same domain on /api path or construct from environment
  console.warn('[API Config] Unknown domain, attempting same-origin fallback');
  return `${protocol}//${hostname}`;
};

export const API_URL = determineAPIUrl();

export const API_ENDPOINTS = {
  MEALS: `${API_URL}/meals`,
  ORDERS: `${API_URL}/orders`,
};

// Export for debugging
export const logAPIConfig = () => {
  console.log('API Configuration:', {
    API_URL,
    MEALS: API_ENDPOINTS.MEALS,
    ORDERS: API_ENDPOINTS.ORDERS,
  });
};
