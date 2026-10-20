import db from '../firebase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { createRouter, isNonEmptyString } from '../lib/router.js';
import { getMeals, addMeal, updateMeal, deleteMeal } from '../services/mealsService.js';

const router = createRouter();

// ===================== Admin Endpoints =====================

// Get ALL orders (admin only)
router.get('/api/admin/orders', authenticate, requireAdmin, async (req, res) => {

  try {
    const snapshot = await db.collection('orders').get();
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    // Orders store their amount as `total`; `totalPrice` covers any older order shape
    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total || o.totalPrice || 0), 0);
    res.json({ orders, count: orders.length, totalRevenue: totalRevenue.toFixed(2) });
  } catch (err) {
    console.error('[Admin] Failed to fetch all orders:', err);
    res.status(500).json({ message: 'Failed to fetch orders.' });
  }
});

// Get ALL users (admin only)
router.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {

  try {
    // Accounts live in `credentials` (signup, login and OTP all write there) — there is no `users` collection
    const snapshot = await db.collection('credentials').get();
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

// ===================== Coupon/Promo Management (Admin) =====================

// Get all coupons
router.get('/api/admin/coupons', authenticate, requireAdmin, async (req, res) => {
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
router.post('/api/admin/coupons', authenticate, requireAdmin, async (req, res) => {
  const { coupon } = req.body;
  if (!coupon || !isNonEmptyString(coupon.code) || !coupon.type || coupon.value === undefined) {
    return res.status(400).json({ message: 'Code, type, and value are required.' });
  }
  if (!['percent', 'flat'].includes(coupon.type) || !(Number(coupon.value) > 0)) {
    return res.status(400).json({ message: 'Type must be percent or flat, and value must be a positive number.' });
  }

  try {
    // Check for duplicate code
    const existing = await db.collection('coupons').where('code', '==', coupon.code.toUpperCase().trim()).limit(1).get();
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
router.put('/api/admin/coupons/:id', authenticate, requireAdmin, async (req, res) => {
  const { active } = req.body;
  try {
    await db.collection('coupons').doc(req.params.id).update({ active: !!active });
    res.json({ message: 'Coupon updated!' });
  } catch (err) {
    console.error('[Coupons] Update error:', err);
    res.status(500).json({ message: 'Failed to update coupon.' });
  }
});

// Delete coupon
router.delete('/api/admin/coupons/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.collection('coupons').doc(req.params.id).delete();
    res.json({ message: 'Coupon deleted!' });
  } catch (err) {
    console.error('[Coupons] Delete error:', err);
    res.status(500).json({ message: 'Failed to delete coupon.' });
  }
});

// ===================== Meal Management (Admin) =====================
// Meals are stored in Firestore now (see services/mealsService.js); data/available-meals.json is only the seed.

// Get meals from Firebase (admin view)
router.get('/api/admin/meals', authenticate, requireAdmin, async (req, res) => {
  try {
    // Read from JSON file (source of truth)
    // (Now read from Firestore via mealsService — the JSON file is only the seed and the fallback.)
    const meals = await getMeals();
    res.json({ meals });
  } catch (err) {
    console.error('[Meals Admin] Fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch meals.' });
  }
});

// Add meal
router.post('/api/admin/meals', authenticate, requireAdmin, async (req, res) => {
  const { meal } = req.body;
  if (!meal || !isNonEmptyString(meal.name) || !meal.price) {
    return res.status(400).json({ message: 'Name and price are required.' });
  }
  if (!(Number(meal.price) > 0)) {
    return res.status(400).json({ message: 'Price must be a positive number.' });
  }
  try {
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
    await addMeal(newMeal);
    res.status(201).json({ message: 'Meal added!', meal: newMeal });
  } catch (err) {
    console.error('[Meals Admin] Add error:', err);
    res.status(500).json({ message: 'Failed to add meal.' });
  }
});

// Update meal
router.put('/api/admin/meals/:id', authenticate, requireAdmin, async (req, res) => {
  const { meal } = req.body;
  if (meal?.price !== undefined && meal.price !== '' && !(Number(meal.price) > 0)) {
    return res.status(400).json({ message: 'Price must be a positive number.' });
  }
  try {
    const updated = await updateMeal(req.params.id, meal);
    if (!updated) return res.status(404).json({ message: 'Meal not found.' });
    res.json({ message: 'Meal updated!', meal: updated });
  } catch (err) {
    console.error('[Meals Admin] Update error:', err);
    res.status(500).json({ message: 'Failed to update meal.' });
  }
});

// Delete meal
router.delete('/api/admin/meals/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteMeal(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Meal not found.' });
    res.json({ message: 'Meal deleted!' });
  } catch (err) {
    console.error('[Meals Admin] Delete error:', err);
    res.status(500).json({ message: 'Failed to delete meal.' });
  }
});

export default router;
