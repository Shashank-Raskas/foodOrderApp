import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
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

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  const { email, password, name } = req.body;

  // Validation
  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email address.' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  if (!name || name.trim() === '') {
    return res.status(400).json({ message: 'Name is required.' });
  }

  try {
    // Check if user already exists
    const existingUser = await db
      .collection('credentials')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (!existingUser.empty) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const userId = uuidv4();
    const newUser = {
      userId,
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };

    await db.collection('credentials').add(newUser);

    res.status(201).json({
      message: 'User created successfully!',
      userId,
      email: newUser.email,
      name: newUser.name,
      createdAt: newUser.createdAt,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Failed to create user.' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email address.' });
  }

  if (!password) {
    return res.status(400).json({ message: 'Password is required.' });
  }

  try {
    // Find user by email
    const userSnapshot = await db
      .collection('credentials')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const userDoc = userSnapshot.docs[0];
    const user = userDoc.data();

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    res.status(200).json({
      message: 'Login successful!',
      userId: user.userId,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

// Update user profile endpoint
app.put('/api/user/profile', async (req, res) => {
  const { userId, name } = req.body;

  // Validation
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  if (!name || name.trim() === '') {
    return res.status(400).json({ message: 'Name cannot be empty.' });
  }

  try {
    // Find user by userId
    const userSnapshot = await db
      .collection('credentials')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const userDoc = userSnapshot.docs[0];

    // Update user name
    await userDoc.ref.update({
      name: name.trim(),
      updatedAt: new Date().toISOString(),
    });

    res.status(200).json({
      message: 'Profile updated successfully!',
      name: name.trim(),
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// Change password endpoint
app.put('/api/user/change-password', async (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;

  // Validation
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  if (!oldPassword) {
    return res.status(400).json({ message: 'Current password is required.' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters.' });
  }

  if (oldPassword === newPassword) {
    return res.status(400).json({ message: 'New password must be different from the old password.' });
  }

  try {
    // Find user by userId
    const userSnapshot = await db
      .collection('credentials')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const userDoc = userSnapshot.docs[0];
    const user = userDoc.data();

    // Verify old password
    const passwordMatch = await bcrypt.compare(oldPassword, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await userDoc.ref.update({
      password: hashedPassword,
      updatedAt: new Date().toISOString(),
    });

    res.status(200).json({
      message: 'Password changed successfully!',
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Failed to change password.' });
  }
});


app.post('/api/orders', async (req, res) => {
  const orderData = req.body.order;
  const { userId } = req.body;

  if (!orderData || !orderData.items || orderData.items.length === 0) {
    return res.status(400).json({ message: 'Missing data.' });
  }

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
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
    userId: userId,
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

// Get user's order history
app.get('/api/user/orders', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  try {
    console.log('[Backend] Fetching orders for userId:', userId);
    
    const ordersSnapshot = await db
      .collection('orders')
      .where('userId', '==', userId)
      .get();

    const orders = [];
    ordersSnapshot.forEach(doc => {
      orders.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Sort by createdAt in descending order (most recent first)
    orders.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    console.log('[Backend] Found', orders.length, 'orders');
    res.status(200).json({
      message: 'Orders fetched successfully!',
      orders: orders,
      count: orders.length
    });
  } catch (err) {
    console.error('[Backend] Failed to fetch orders:', err);
    res.status(500).json({ message: 'Failed to fetch orders.', error: err.message });
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

