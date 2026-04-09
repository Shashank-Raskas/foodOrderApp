import fs from 'node:fs/promises';
import dns from 'node:dns';
import dotenv from 'dotenv';

// Force IPv4 for all DNS lookups — Render doesn't support outbound IPv6
dns.setDefaultResultOrder('ipv4first');
import bodyParser from 'body-parser';
import compression from 'compression';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from './firebase.js';
import { generateOtp, storeOtp, verifyOtp, checkRateLimit, cleanupOtp } from './services/otpService.js';
import { sendOtpEmail, isEmailConfigured, sendOrderConfirmationEmail } from './services/emailService.js';
import { sendOtpSms, isSmsConfigured } from './services/smsService.js';

// Load environment variables
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

const app = express();

// Gzip/Brotli compress all responses (JSON, images, HTML)
app.use(compression());

app.use(bodyParser.json());
app.use(express.static('public', {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  immutable: true,
}));

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

  if (password && password.length < 6) {
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

    // Hash password (if provided)
    const userId = uuidv4();
    const newUser = {
      userId,
      email: email.toLowerCase(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };

    if (password) {
      newUser.password = await bcrypt.hash(password, 10);
    }

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

    // Check if user has a password set (OTP-only users won't)
    if (!user.password) {
      return res.status(401).json({ message: 'This account uses OTP login. Please sign in with OTP instead.' });
    }

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


// ===================== OTP Auth =====================

// Config endpoint — tells frontend which OTP methods are available
app.get('/api/auth/config', (req, res) => {
  res.json({
    emailOtp: true, // Always available — falls back to dev-mode console logging
    phoneOtp: isSmsConfigured(),
  });
});

// Send OTP
app.post('/api/otp/send', async (req, res) => {
  const { type, destination } = req.body; // type: 'email' | 'phone'

  // Validate type
  if (!type || !['email', 'phone'].includes(type)) {
    return res.status(400).json({ message: 'Invalid OTP type. Use "email" or "phone".' });
  }

  // Validate destination
  if (!destination || !destination.trim()) {
    return res.status(400).json({ message: `Please provide a valid ${type === 'email' ? 'email address' : 'phone number'}.` });
  }

  const dest = destination.trim().toLowerCase();

  if (type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }
  }

  if (type === 'phone') {
    // Basic phone validation — must start with + and have at least 10 digits
    if (!/^\+\d{10,15}$/.test(dest.replace(/[\s\-()]/g, ''))) {
      return res.status(400).json({ message: 'Please provide a valid phone number with country code (e.g., +91XXXXXXXXXX).' });
    }
    if (!isSmsConfigured()) {
      return res.status(503).json({ message: 'SMS OTP service is not configured on the server.' });
    }
  }

  try {
    // Rate limit check
    const allowed = await checkRateLimit(dest);
    if (!allowed) {
      return res.status(429).json({ message: 'Too many OTP requests. Please wait a few minutes before trying again.' });
    }

    // Generate and store OTP
    const otp = generateOtp();
    await storeOtp(dest, otp, type);

    // Send OTP
    if (type === 'email') {
      if (isEmailConfigured()) {
        console.log(`[OTP] Attempting to send email OTP to ${dest}...`);
        await sendOtpEmail(dest, otp);
        console.log(`[OTP] Email OTP sent successfully to ${dest}`);
      } else {
        // Dev mode — no email configured, log OTP to console
        console.log(`\n========================================`);
        console.log(`  [DEV MODE] OTP for ${dest}: ${otp}`);
        console.log(`========================================\n`);
      }
    } else {
      await sendOtpSms(dest, otp);
    }

    console.log(`[OTP] Sent ${type} OTP to ${dest}`);
    res.status(200).json({ message: `OTP sent to your ${type === 'email' ? 'email' : 'phone'}!` });
  } catch (err) {
    console.error('[OTP] Send error:', err.message || err);
    console.error('[OTP] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    res.status(500).json({ message: err.message || 'Failed to send OTP. Please try again.' });
  }
});

// Verify OTP and login/signup
app.post('/api/otp/verify', async (req, res) => {
  const { type, destination, otp, name } = req.body;

  if (!type || !['email', 'phone'].includes(type)) {
    return res.status(400).json({ message: 'Invalid OTP type.' });
  }

  if (!destination || !otp) {
    return res.status(400).json({ message: 'Destination and OTP are required.' });
  }

  const dest = destination.trim().toLowerCase();

  try {
    // Verify OTP
    const result = await verifyOtp(dest, otp.trim());

    if (!result.valid) {
      return res.status(400).json({ message: result.reason });
    }

    // OTP is valid — find or create user
    const field = type === 'email' ? 'email' : 'phone';
    const userSnapshot = await db
      .collection('credentials')
      .where(field, '==', dest)
      .limit(1)
      .get();

    let userData;

    if (!userSnapshot.empty) {
      // Existing user — login
      const user = userSnapshot.docs[0].data();
      userData = {
        userId: user.userId,
        email: user.email || null,
        phone: user.phone || null,
        name: user.name,
        createdAt: user.createdAt,
        isNewUser: false,
      };
    } else {
      // New user — require name for signup
      if (!name || !name.trim()) {
        return res.status(400).json({
          message: 'Name is required for new accounts.',
          needsName: true,
        });
      }

      // Create new user
      const userId = uuidv4();
      const newUser = {
        userId,
        name: name.trim(),
        createdAt: new Date().toISOString(),
      };

      if (type === 'email') {
        newUser.email = dest;
      } else {
        newUser.phone = dest;
      }

      await db.collection('credentials').add(newUser);

      userData = {
        userId,
        email: newUser.email || null,
        phone: newUser.phone || null,
        name: newUser.name,
        createdAt: newUser.createdAt,
        isNewUser: true,
      };
    }

    // Clean up used OTPs after successful auth
    await cleanupOtp(dest);

    res.status(200).json({
      message: userData.isNewUser ? 'Account created successfully!' : 'Login successful!',
      ...userData,
    });
  } catch (err) {
    console.error('[OTP] Verify error:', err);
    res.status(500).json({ message: 'Verification failed. Please try again.' });
  }
});

// ===================== End OTP Auth =====================


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

    // Award loyalty points: 1 point per ₹10 spent
    if (userId) {
      const pointsEarned = Math.floor(parseFloat(newOrder.total || newOrder.items.reduce((s, i) => s + i.price * i.quantity, 0)) / 10);
      if (pointsEarned > 0) {
        const loyaltyRef = db.collection('loyalty').doc(userId);
        const loyaltyDoc = await loyaltyRef.get();
        const current = loyaltyDoc.exists ? loyaltyDoc.data() : { points: 0, history: [] };
        const historyEntry = { type: 'earned', points: pointsEarned, orderId: newOrder.id, date: new Date().toISOString() };
        await loyaltyRef.set({
          points: (current.points || 0) + pointsEarned,
          history: [...(current.history || []).slice(-49), historyEntry],
        });
      }
    }

    // Increment coupon usage if a promo code was applied
    if (orderData.promoCode) {
      const couponSnap = await db.collection('coupons').where('code', '==', orderData.promoCode.toUpperCase()).limit(1).get();
      if (!couponSnap.empty) {
        const couponDoc = couponSnap.docs[0];
        await couponDoc.ref.update({ usedCount: (couponDoc.data().usedCount || 0) + 1 });
      }
    }

    res.status(201).json({ message: 'Order created!' });

    // Send order confirmation email — non-blocking, won't fail the order
    if (isEmailConfigured()) {
      sendOrderConfirmationEmail(customer.email, newOrder).catch(err =>
        console.error('[Email] Order confirmation failed:', err.message)
      );
    }
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


// ===================== Admin Endpoints =====================
const ADMIN_EMAIL = 'flavor.alchemist9@gmail.com';

// Get ALL orders (admin only)
app.get('/api/admin/orders', async (req, res) => {
  const { adminEmail } = req.query;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }

  try {
    const snapshot = await db.collection('orders').get();
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.totalPrice || 0), 0);
    res.json({ orders, count: orders.length, totalRevenue: totalRevenue.toFixed(2) });
  } catch (err) {
    console.error('[Admin] Failed to fetch all orders:', err);
    res.status(500).json({ message: 'Failed to fetch orders.' });
  }
});

// Get ALL users (admin only)
app.get('/api/admin/users', async (req, res) => {
  const { adminEmail } = req.query;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }

  try {
    const snapshot = await db.collection('users').get();
    const users = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Never expose passwords
      const { password, ...safeData } = data;
      users.push({ id: doc.id, ...safeData });
    });
    users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ users, count: users.length });
  } catch (err) {
    console.error('[Admin] Failed to fetch users:', err);
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

// ===================== Loyalty Points =====================

// Get user loyalty points
app.get('/api/user/loyalty', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });

  try {
    const doc = await db.collection('loyalty').doc(userId).get();
    if (!doc.exists) {
      return res.json({ points: 0, history: [] });
    }
    const data = doc.data();
    res.json({ points: data.points || 0, history: data.history || [] });
  } catch (err) {
    console.error('[Loyalty] Fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch loyalty points.' });
  }
});

// Redeem loyalty points
app.post('/api/user/loyalty/redeem', async (req, res) => {
  const { userId, points } = req.body;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  if (!points || points < 50) return res.status(400).json({ message: 'Minimum 50 points required to redeem.' });

  try {
    const loyaltyRef = db.collection('loyalty').doc(userId);
    const doc = await loyaltyRef.get();
    if (!doc.exists || (doc.data().points || 0) < points) {
      return res.status(400).json({ message: 'Not enough points.' });
    }
    const current = doc.data();
    const discount = Math.floor(points / 10); // 10 points = ₹1
    const historyEntry = { type: 'redeemed', points: -points, discount, date: new Date().toISOString() };
    await loyaltyRef.update({
      points: current.points - points,
      history: [...(current.history || []).slice(-49), historyEntry],
    });
    res.json({ message: 'Points redeemed!', discount, remainingPoints: current.points - points });
  } catch (err) {
    console.error('[Loyalty] Redeem error:', err);
    res.status(500).json({ message: 'Failed to redeem points.' });
  }
});

// ===================== Coupon/Promo Management (Admin) =====================

// Get all coupons
app.get('/api/admin/coupons', async (req, res) => {
  const { adminEmail } = req.query;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  try {
    const snapshot = await db.collection('coupons').get();
    const coupons = [];
    snapshot.forEach(doc => coupons.push({ id: doc.id, ...doc.data() }));
    coupons.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ coupons });
  } catch (err) {
    console.error('[Coupons] Fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch coupons.' });
  }
});

// Create coupon
app.post('/api/admin/coupons', async (req, res) => {
  const { adminEmail, coupon } = req.body;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  if (!coupon || !coupon.code || !coupon.type || coupon.value === undefined) {
    return res.status(400).json({ message: 'Code, type, and value are required.' });
  }

  try {
    // Check for duplicate code
    const existing = await db.collection('coupons').where('code', '==', coupon.code.toUpperCase()).limit(1).get();
    if (!existing.empty) {
      return res.status(400).json({ message: 'A coupon with this code already exists.' });
    }
    const data = {
      code: coupon.code.toUpperCase().trim(),
      type: coupon.type, // 'percent' or 'flat'
      value: Number(coupon.value),
      maxDiscount: Number(coupon.maxDiscount) || 0,
      minOrder: Number(coupon.minOrder) || 0,
      maxUses: Number(coupon.maxUses) || 0, // 0 = unlimited
      usedCount: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const ref = await db.collection('coupons').add(data);
    res.status(201).json({ message: 'Coupon created!', coupon: { id: ref.id, ...data } });
  } catch (err) {
    console.error('[Coupons] Create error:', err);
    res.status(500).json({ message: 'Failed to create coupon.' });
  }
});

// Toggle coupon active status
app.put('/api/admin/coupons/:id', async (req, res) => {
  const { adminEmail, active } = req.body;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  try {
    await db.collection('coupons').doc(req.params.id).update({ active: !!active });
    res.json({ message: 'Coupon updated!' });
  } catch (err) {
    console.error('[Coupons] Update error:', err);
    res.status(500).json({ message: 'Failed to update coupon.' });
  }
});

// Delete coupon
app.delete('/api/admin/coupons/:id', async (req, res) => {
  const { adminEmail } = req.query;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  try {
    await db.collection('coupons').doc(req.params.id).delete();
    res.json({ message: 'Coupon deleted!' });
  } catch (err) {
    console.error('[Coupons] Delete error:', err);
    res.status(500).json({ message: 'Failed to delete coupon.' });
  }
});

// Validate coupon (user-facing)
app.post('/api/coupons/validate', async (req, res) => {
  const { code, cartTotal } = req.body;
  if (!code) return res.status(400).json({ message: 'Promo code is required.' });

  try {
    const snapshot = await db.collection('coupons').where('code', '==', code.toUpperCase().trim()).limit(1).get();
    if (snapshot.empty) {
      return res.status(404).json({ message: 'Invalid promo code.' });
    }
    const doc = snapshot.docs[0];
    const coupon = doc.data();

    if (!coupon.active) {
      return res.status(400).json({ message: 'This promo code is no longer active.' });
    }
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ message: 'This promo code has been fully redeemed.' });
    }
    if (coupon.minOrder > 0 && cartTotal < coupon.minOrder) {
      return res.status(400).json({ message: `Minimum order of ₹${coupon.minOrder} required.` });
    }

    let discount = 0;
    if (coupon.type === 'percent') {
      discount = Math.min((cartTotal * coupon.value) / 100, coupon.maxDiscount || Infinity);
    } else {
      discount = coupon.value;
    }

    res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      maxDiscount: coupon.maxDiscount,
      discount: Math.round(discount * 100) / 100,
    });
  } catch (err) {
    console.error('[Coupons] Validate error:', err);
    res.status(500).json({ message: 'Failed to validate coupon.' });
  }
});

// ===================== Meal Management (Admin) =====================

// Get meals from Firebase (admin view)
app.get('/api/admin/meals', async (req, res) => {
  const { adminEmail } = req.query;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  try {
    // Read from JSON file (source of truth)
    const meals = JSON.parse(await fs.readFile('./data/available-meals.json', 'utf8'));
    res.json({ meals });
  } catch (err) {
    console.error('[Meals Admin] Fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch meals.' });
  }
});

// Add meal
app.post('/api/admin/meals', async (req, res) => {
  const { adminEmail, meal } = req.body;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  if (!meal || !meal.name || !meal.price) {
    return res.status(400).json({ message: 'Name and price are required.' });
  }
  try {
    const meals = JSON.parse(await fs.readFile('./data/available-meals.json', 'utf8'));
    const newMeal = {
      id: `m${Date.now()}`,
      name: meal.name.trim(),
      price: String(meal.price),
      description: meal.description || '',
      image: meal.image || 'images/default-meal.jpg',
      category: meal.category || 'entrees',
      dietary: meal.dietary || [],
      spiceLevel: meal.spiceLevel || 'mild',
      protein: meal.protein || 'vegetarian',
      servingSize: meal.servingSize || 'individual',
      isChefSpecial: meal.isChefSpecial || false,
      availableTime: meal.availableTime || 'all-day',
    };
    meals.push(newMeal);
    await fs.writeFile('./data/available-meals.json', JSON.stringify(meals, null, 2));
    res.status(201).json({ message: 'Meal added!', meal: newMeal });
  } catch (err) {
    console.error('[Meals Admin] Add error:', err);
    res.status(500).json({ message: 'Failed to add meal.' });
  }
});

// Update meal
app.put('/api/admin/meals/:id', async (req, res) => {
  const { adminEmail, meal } = req.body;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  try {
    const meals = JSON.parse(await fs.readFile('./data/available-meals.json', 'utf8'));
    const idx = meals.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Meal not found.' });

    meals[idx] = { ...meals[idx], ...meal, id: req.params.id, price: String(meal.price || meals[idx].price) };
    await fs.writeFile('./data/available-meals.json', JSON.stringify(meals, null, 2));
    res.json({ message: 'Meal updated!', meal: meals[idx] });
  } catch (err) {
    console.error('[Meals Admin] Update error:', err);
    res.status(500).json({ message: 'Failed to update meal.' });
  }
});

// Delete meal
app.delete('/api/admin/meals/:id', async (req, res) => {
  const { adminEmail } = req.query;
  if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  try {
    const meals = JSON.parse(await fs.readFile('./data/available-meals.json', 'utf8'));
    const filtered = meals.filter(m => m.id !== req.params.id);
    if (filtered.length === meals.length) return res.status(404).json({ message: 'Meal not found.' });
    await fs.writeFile('./data/available-meals.json', JSON.stringify(filtered, null, 2));
    res.json({ message: 'Meal deleted!' });
  } catch (err) {
    console.error('[Meals Admin] Delete error:', err);
    res.status(500).json({ message: 'Failed to delete meal.' });
  }
});

// ===================== Ratings & Reviews =====================

// Get reviews for a meal
app.get('/api/meals/:id/reviews', async (req, res) => {
  try {
    const snapshot = await db.collection('reviews').where('mealId', '==', req.params.id).get();
    const reviews = [];
    snapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
    reviews.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const totalRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const avgRating = reviews.length > 0 ? Math.round((totalRating / reviews.length) * 10) / 10 : 0;

    res.json({ reviews, count: reviews.length, avgRating });
  } catch (err) {
    console.error('[Reviews] Fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch reviews.' });
  }
});

// Submit a review
app.post('/api/meals/:id/reviews', async (req, res) => {
  const { userId, userName, rating, comment } = req.body;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be between 1 and 5.' });

  try {
    // Check if user already reviewed this meal
    const existing = await db.collection('reviews')
      .where('mealId', '==', req.params.id)
      .where('userId', '==', userId)
      .limit(1).get();

    if (!existing.empty) {
      // Update existing review
      const doc = existing.docs[0];
      await doc.ref.update({ rating: Number(rating), comment: (comment || '').trim(), updatedAt: new Date().toISOString() });
      return res.json({ message: 'Review updated!', review: { id: doc.id, ...doc.data(), rating: Number(rating), comment: (comment || '').trim() } });
    }

    const reviewData = {
      mealId: req.params.id,
      userId,
      userName: userName || 'Anonymous',
      rating: Number(rating),
      comment: (comment || '').trim(),
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('reviews').add(reviewData);
    res.status(201).json({ message: 'Review submitted!', review: { id: ref.id, ...reviewData } });
  } catch (err) {
    console.error('[Reviews] Submit error:', err);
    res.status(500).json({ message: 'Failed to submit review.' });
  }
});

// ===================== User Addresses =====================

// Get user addresses
app.get('/api/user/addresses', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });

  try {
    const snapshot = await db.collection('addresses').where('userId', '==', userId).get();
    const addresses = [];
    snapshot.forEach(doc => addresses.push({ id: doc.id, ...doc.data() }));
    addresses.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ addresses });
  } catch (err) {
    console.error('[Addresses] Fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch addresses.' });
  }
});

// Add or update address
app.post('/api/user/addresses', async (req, res) => {
  const { userId, address } = req.body;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  if (!address || !address.street || !address.city || !address.postalCode) {
    return res.status(400).json({ message: 'Street, city, and postal code are required.' });
  }

  try {
    const data = {
      userId,
      label: address.label || 'Home',
      name: address.name || '',
      phone: address.phone || '',
      street: address.street.trim(),
      city: address.city.trim(),
      postalCode: address.postalCode.trim(),
      isDefault: address.isDefault || false,
      createdAt: new Date().toISOString(),
    };

    // If setting as default, unset other defaults
    if (data.isDefault) {
      const existing = await db.collection('addresses').where('userId', '==', userId).where('isDefault', '==', true).get();
      const batch = db.batch();
      existing.forEach(doc => batch.update(doc.ref, { isDefault: false }));
      await batch.commit();
    }

    if (address.id) {
      // Update existing
      await db.collection('addresses').doc(address.id).update(data);
      res.json({ message: 'Address updated!', address: { id: address.id, ...data } });
    } else {
      // Create new
      const ref = await db.collection('addresses').add(data);
      res.status(201).json({ message: 'Address saved!', address: { id: ref.id, ...data } });
    }
  } catch (err) {
    console.error('[Addresses] Save error:', err);
    res.status(500).json({ message: 'Failed to save address.' });
  }
});

// Delete address
app.delete('/api/user/addresses/:id', async (req, res) => {
  try {
    await db.collection('addresses').doc(req.params.id).delete();
    res.json({ message: 'Address deleted!' });
  } catch (err) {
    console.error('[Addresses] Delete error:', err);
    res.status(500).json({ message: 'Failed to delete address.' });
  }
});

// Update user contact info (phone)
app.put('/api/user/contact', async (req, res) => {
  const { userId, phone } = req.body;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });

  try {
    const userSnapshot = await db.collection('credentials').where('userId', '==', userId).limit(1).get();
    if (userSnapshot.empty) return res.status(404).json({ message: 'User not found.' });
    await userSnapshot.docs[0].ref.update({ phone: phone || '', updatedAt: new Date().toISOString() });
    res.json({ message: 'Contact updated!' });
  } catch (err) {
    console.error('[Contact] Update error:', err);
    res.status(500).json({ message: 'Failed to update contact.' });
  }
});

// ===================== End User Addresses =====================

// ===================== Health Check =====================
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
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

  // ===================== Keep-Alive Self-Ping =====================
  // Ping ourselves every 10 minutes to prevent Render free-tier spin-down.
  // 750 free hours/month ≈ 31.25 days — covers 24/7 for a single service.
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // Render sets this automatically
  if (RENDER_URL) {
    const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
    setInterval(async () => {
      try {
        const resp = await fetch(`${RENDER_URL}/api/health`);
        console.log(`[Keep-Alive] Pinged ${RENDER_URL}/api/health — ${resp.status}`);
      } catch (err) {
        console.warn(`[Keep-Alive] Ping failed:`, err.message);
      }
    }, PING_INTERVAL);
    console.log(`[Keep-Alive] Self-ping enabled every 10 min → ${RENDER_URL}/api/health`);
  } else {
    console.log('[Keep-Alive] No RENDER_EXTERNAL_URL set — self-ping disabled (local dev)');
  }
});

