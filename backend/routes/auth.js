import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from '../firebase.js';
import { createRouter, isNonEmptyString } from '../lib/router.js';
import { rateLimit, byBodyField } from '../middleware/rateLimit.js';
import {
  generateTokens,
  storeRefreshToken,
  determineRole,
  verifyRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
} from '../services/tokenService.js';
import { generateOtp, storeOtp, verifyOtp, checkRateLimit, cleanupOtp } from '../services/otpService.js';
import { sendOtpEmail, isEmailConfigured } from '../services/emailService.js';
import { sendOtpSms, isSmsConfigured } from '../services/smsService.js';

const router = createRouter();

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Per-IP limits catch scripted abuse; the per-email login limit slows password guessing on one account
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many signup attempts. Please try again later.' });
const loginIpLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 30, message: 'Too many login attempts. Please try again in a few minutes.' });
const loginEmailLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, key: byBodyField('email'), message: 'Too many login attempts for this account. Please try again in a few minutes, or sign in with OTP.' });
const otpSendLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, message: 'Too many OTP requests. Please wait a few minutes before trying again.' });
const otpVerifyLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 30, message: 'Too many verification attempts. Please wait a few minutes before trying again.' });

// Signup endpoint
router.post('/api/signup', signupLimiter, async (req, res) => {
  const { email, password, name } = req.body;

  // Validation
  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email address.' });
  }

  if (password && (typeof password !== 'string' || password.length < 6)) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  if (!isNonEmptyString(name)) {
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
    // Password signup doesn't prove the email belongs to this person, so it never grants admin.
    // The admin address gets its role from an OTP-verified login instead (see /api/otp/verify).
    const role = 'user';
    const newUser = {
      userId,
      email: email.toLowerCase(),
      name: name.trim(),
      role,
      createdAt: new Date().toISOString(),
    };

    if (password) {
      newUser.password = await bcrypt.hash(password, 10);
    }

    await db.collection('credentials').add(newUser);

    // Generate JWT tokens
    const tokens = generateTokens({ userId, email: newUser.email, role });
    await storeRefreshToken(userId, tokens.refreshToken);

    res.status(201).json({
      message: 'User created successfully!',
      userId,
      email: newUser.email,
      name: newUser.name,
      role,
      createdAt: newUser.createdAt,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Failed to create user.' });
  }
});

// Login endpoint
router.post('/api/login', loginIpLimiter, loginEmailLimiter, async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email address.' });
  }

  if (!password || typeof password !== 'string') {
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

    // Ensure role field exists (migrate old users)
    const role = user.role || determineRole(user.email);
    if (!user.role) {
      await userDoc.ref.update({ role });
    }

    // Generate JWT tokens
    const tokens = generateTokens({ userId: user.userId, email: user.email, role });
    await storeRefreshToken(user.userId, tokens.refreshToken);

    res.status(200).json({
      message: 'Login successful!',
      userId: user.userId,
      email: user.email,
      name: user.name,
      role,
      createdAt: user.createdAt,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});


// ===================== OTP Auth =====================

// Config endpoint — tells frontend which OTP methods are available
router.get('/api/auth/config', (req, res) => {
  res.json({
    emailOtp: true, // Always available — falls back to dev-mode console logging
    phoneOtp: isSmsConfigured(),
  });
});

// Send OTP
router.post('/api/otp/send', otpSendLimiter, async (req, res) => {
  const { type, destination } = req.body; // type: 'email' | 'phone'

  // Validate type
  if (!type || !['email', 'phone'].includes(type)) {
    return res.status(400).json({ message: 'Invalid OTP type. Use "email" or "phone".' });
  }

  // Validate destination
  if (!isNonEmptyString(destination)) {
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
    // Provider errors (Brevo/Twilio responses) stay in the server log, not in the response
    res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
  }
});

// Verify OTP and login/signup
router.post('/api/otp/verify', otpVerifyLimiter, async (req, res) => {
  const { type, destination, otp, name } = req.body;

  if (!type || !['email', 'phone'].includes(type)) {
    return res.status(400).json({ message: 'Invalid OTP type.' });
  }

  if (!isNonEmptyString(destination) || !otp || !['string', 'number'].includes(typeof otp)) {
    return res.status(400).json({ message: 'Destination and OTP are required.' });
  }

  const dest = destination.trim().toLowerCase();

  try {
    // Verify OTP
    const result = await verifyOtp(dest, String(otp).trim());

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
      const userDoc = userSnapshot.docs[0];
      const user = userDoc.data();

      // Ensure role field exists (migrate old users)
      let role = user.role || determineRole(user.email);
      // An email OTP proves the person owns the address, so the admin email is promoted here
      // (password signups no longer grant admin on their own).
      if (type === 'email' && determineRole(user.email) === 'admin') {
        role = 'admin';
      }
      if (user.role !== role) {
        await userDoc.ref.update({ role });
      }

      userData = {
        userId: user.userId,
        email: user.email || null,
        phone: user.phone || null,
        name: user.name,
        role,
        createdAt: user.createdAt,
        isNewUser: false,
      };
    } else {
      // New user — require name for signup
      if (!isNonEmptyString(name)) {
        return res.status(400).json({
          message: 'Name is required for new accounts.',
          needsName: true,
        });
      }

      // Create new user
      const userId = uuidv4();
      const userEmail = type === 'email' ? dest : null;
      const role = determineRole(userEmail);
      const newUser = {
        userId,
        name: name.trim(),
        role,
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
        role,
        createdAt: newUser.createdAt,
        isNewUser: true,
      };
    }

    // Clean up used OTPs after successful auth
    await cleanupOtp(dest);

    // Generate JWT tokens
    const tokens = generateTokens({ userId: userData.userId, email: userData.email || '', role: userData.role });
    await storeRefreshToken(userData.userId, tokens.refreshToken);

    res.status(200).json({
      message: userData.isNewUser ? 'Account created successfully!' : 'Login successful!',
      ...userData,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    console.error('[OTP] Verify error:', err);
    res.status(500).json({ message: 'Verification failed. Please try again.' });
  }
});

// ===================== End OTP Auth =====================

// ===================== Token Refresh & Logout =====================

// Refresh access token
router.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ message: 'Refresh token is required.' });
  }

  try {
    // Verify the refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Check if token exists in Firestore (not revoked)
    const tokenDoc = await findRefreshToken(refreshToken, decoded.userId);

    if (!tokenDoc) {
      return res.status(401).json({ message: 'Invalid refresh token. Please log in again.' });
    }

    // Fetch latest role from credentials (in case it was changed by admin)
    let role = decoded.role;
    const userSnap = await db.collection('credentials').where('userId', '==', decoded.userId).limit(1).get();
    if (!userSnap.empty) {
      role = userSnap.docs[0].data().role || role;
    }

    // Generate new access token (rotate refresh token too)
    const tokens = generateTokens({ userId: decoded.userId, email: decoded.email, role });

    // Delete old refresh token and store new one
    await tokenDoc.ref.delete();
    await storeRefreshToken(decoded.userId, tokens.refreshToken);

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token expired. Please log in again.' });
    }
    console.error('[Auth] Refresh error:', err);
    return res.status(401).json({ message: 'Invalid refresh token.' });
  }
});

// Logout — revoke refresh token
router.post('/api/auth/logout', async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken && typeof refreshToken === 'string') {
    try {
      await revokeRefreshToken(refreshToken);
    } catch (err) {
      console.error('[Auth] Logout cleanup error:', err);
    }
  }

  res.json({ message: 'Logged out successfully.' });
});

// ===================== End Token Refresh & Logout =====================

export default router;
