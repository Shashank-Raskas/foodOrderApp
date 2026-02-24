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

// Ultra-permissive CORS for development and cloud deployment
// In production with real security, you'd be more restrictive
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const requestMethod = req.method;
  
  console.log(`[CORS] ${requestMethod} request from origin: ${origin}`);
  
  // ALWAYS allow requests - this is safe because:
  // 1. GET /meals just returns public data
  // 2. POST /orders still validates all data on backend
  // 3. Firebase auth happens on backend (environment variable)
  // Real security comes from backend validation, not CORS
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Immediately respond to preflight OPTIONS requests
  if (requestMethod === 'OPTIONS') {
    console.log('[CORS] Responding to preflight request');
    return res.sendStatus(200);
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

