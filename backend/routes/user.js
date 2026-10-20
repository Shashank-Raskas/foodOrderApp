import bcrypt from 'bcryptjs';
import db from '../firebase.js';
import { authenticate } from '../middleware/auth.js';
import { createRouter, isNonEmptyString } from '../lib/router.js';

const router = createRouter();

// Update user profile endpoint
router.put('/api/user/profile', authenticate, async (req, res) => {
  const { name } = req.body;
  const userId = req.user.userId;

  if (!isNonEmptyString(name)) {
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
router.put('/api/user/change-password', authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.userId;

  if (!oldPassword || typeof oldPassword !== 'string') {
    return res.status(400).json({ message: 'Current password is required.' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
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

    // OTP-only accounts have no password to compare against (bcrypt would throw and return a 500)
    if (!user.password) {
      return res.status(400).json({ message: 'This account signs in with OTP and has no password to change.' });
    }

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

// ===================== Loyalty Points =====================

// Get user loyalty points
router.get('/api/user/loyalty', authenticate, async (req, res) => {
  const userId = req.user.userId;

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
// This now only *quotes* the discount for the checkout screen. The points are actually deducted inside
// POST /api/orders when the order is placed, so closing checkout no longer throws the points away.
router.post('/api/user/loyalty/redeem', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const points = Math.floor(Number(req.body.points));
  if (!points || points < 50) return res.status(400).json({ message: 'Minimum 50 points required to redeem.' });

  try {
    const loyaltyRef = db.collection('loyalty').doc(userId);
    const doc = await loyaltyRef.get();
    if (!doc.exists || (doc.data().points || 0) < points) {
      return res.status(400).json({ message: 'Not enough points.' });
    }
    const current = doc.data();
    const discount = Math.floor(points / 10); // 10 points = ₹1
    const pointsToUse = discount * 10;
    res.json({ message: 'Points redeemed!', discount, points: pointsToUse, remainingPoints: current.points - pointsToUse });
  } catch (err) {
    console.error('[Loyalty] Redeem error:', err);
    res.status(500).json({ message: 'Failed to redeem points.' });
  }
});

// ===================== User Addresses =====================

// Get user addresses
router.get('/api/user/addresses', authenticate, async (req, res) => {
  const userId = req.user.userId;

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

/** Load an address doc only if it belongs to the user; null otherwise (also for malformed ids). */
async function getOwnedAddress(id, userId) {
  if (!isNonEmptyString(id) || id.includes('/')) return null;
  const doc = await db.collection('addresses').doc(id).get();
  return doc.exists && doc.data().userId === userId ? doc : null;
}

// Add or update address
router.post('/api/user/addresses', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { address } = req.body;
  if (!address || !isNonEmptyString(address.street) || !isNonEmptyString(address.city) || !isNonEmptyString(address.postalCode)) {
    return res.status(400).json({ message: 'Street, city, and postal code are required.' });
  }

  try {
    // Updating: the address must exist and belong to this user (previously any logged-in user
    // could overwrite anyone's address by sending its id)
    let existingDoc = null;
    if (address.id) {
      existingDoc = await getOwnedAddress(address.id, userId);
      if (!existingDoc) {
        return res.status(404).json({ message: 'Address not found.' });
      }
    }

    const data = {
      userId,
      label: address.label || 'Home',
      name: address.name || '',
      phone: address.phone || '',
      street: address.street.trim(),
      city: address.city.trim(),
      postalCode: address.postalCode.trim(),
      isDefault: address.isDefault || false,
      // Keep the original creation date on updates so the address list order doesn't jump around
      createdAt: existingDoc?.data().createdAt || new Date().toISOString(),
    };
    if (existingDoc) data.updatedAt = new Date().toISOString();

    // If setting as default, unset other defaults
    if (data.isDefault) {
      const existing = await db.collection('addresses').where('userId', '==', userId).where('isDefault', '==', true).get();
      const batch = db.batch();
      existing.forEach(doc => batch.update(doc.ref, { isDefault: false }));
      await batch.commit();
    }

    if (existingDoc) {
      // Update existing
      await existingDoc.ref.update(data);
      res.json({ message: 'Address updated!', address: { id: existingDoc.id, ...data } });
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
router.delete('/api/user/addresses/:id', authenticate, async (req, res) => {
  try {
    const doc = await getOwnedAddress(req.params.id, req.user.userId);
    if (!doc) {
      return res.status(404).json({ message: 'Address not found.' });
    }
    await doc.ref.delete();
    res.json({ message: 'Address deleted!' });
  } catch (err) {
    console.error('[Addresses] Delete error:', err);
    res.status(500).json({ message: 'Failed to delete address.' });
  }
});

// Update user contact info (phone)
router.put('/api/user/contact', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { phone } = req.body;

  if (phone && typeof phone !== 'string') {
    return res.status(400).json({ message: 'Invalid phone number.' });
  }

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

export default router;
