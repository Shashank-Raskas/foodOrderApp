// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const API_ENDPOINTS = {
  MEALS: `${API_URL}/meals`,
  ORDERS: `${API_URL}/orders`,
};
