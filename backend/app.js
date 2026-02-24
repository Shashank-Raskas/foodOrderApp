import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from './firebase.js'; // add this import

// Load environment variables
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

const app = express();

app.use(bodyParser.json());
app.use(express.static('public'));

// Smart CORS configuration - Auto-allow same domain + localhost
const configureCORS = () => {
  // Start with explicit env configuration if provided
  let allowedOrigins = [];
  
  if (process.env.ALLOWED_ORIGINS) {
    allowedOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
  }
  
  // Always allow localhost/127.0.0.1 for development
  allowedOrigins.push('http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173');
  
  console.log('[CORS] Configured allowed origins:', allowedOrigins);
  
  return allowedOrigins;
};

const ALLOWED_ORIGINS = configureCORS();

// CORS Middleware - Handle both preflight and actual requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const requestMethod = req.method;
  
  // Check if origin is allowed
  const isOriginAllowed = ALLOWED_ORIGINS.some(allowed => {
    if (allowed === '*') return true;
    if (origin === allowed) return true;
    // For Render apps, allow any onrender.com domain to any onrender.com domain
    if (origin && allowed && origin.includes('onrender.com') && allowed.includes('onrender.com')) {
      return true;
    }
    return false;
  });
  
  // Set CORS headers if origin is allowed
  if (isOriginAllowed || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  }
  
  // Immediately respond to preflight requests
  if (requestMethod === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  // For actual requests, log if CORS would have failed
  if (!isOriginAllowed && origin) {
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
  }
  
  next();
});

app.get('/meals', async (req, res) => {
  const meals = await fs.readFile('./data/available-meals.json', 'utf8');
  res.json(JSON.parse(meals));
});


app.post('/orders', async (req, res) => {
  const orderData = req.body.order;

  if (!orderData || !orderData.items || orderData.items.length === 0) {
    return res.status(400).json({ message: 'Missing data.' });
  }

  const customer = orderData.customer;
  if (
    !customer.email || !customer.email.includes('@') ||
    !customer.name || customer.name.trim() === '' ||
    !customer.street || customer.street.trim() === '' ||
    !customer['postal-code'] || customer['postal-code'].trim() === '' ||
    !customer.city || customer.city.trim() === ''
  ) {
    return res.status(400).json({
      message: 'Missing data: Email, name, street, postal code or city is missing.',
    });
  }

  const newOrder = {
    ...orderData,
    id: uuidv4(),
    createdAt: new Date().toISOString()
  };

  try {
    await db.collection('orders').add(newOrder);
    res.status(201).json({ message: 'Order created!' });
  } catch (err) {
    console.error('Failed to save to Firebase:', err);
    res.status(500).json({ message: 'Failed to save order.' });
  }
});


app.use((req, res) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  res.status(404).json({ message: 'Not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

