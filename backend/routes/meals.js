import db from '../firebase.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createRouter, isNonEmptyString } from '../lib/router.js';
import { getMeals } from '../services/mealsService.js';
import { couponQuery, evaluateCoupon } from '../services/couponService.js';

const router = createRouter();

const MAX_REVIEW_LENGTH = 1000;

// Slows down guessing promo codes by brute force
const couponValidateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many promo code attempts. Please try again in a few minutes.' });

router.get('/meals', async (req, res) => {
  res.json(await getMeals());
});

// ===================== Ratings & Reviews =====================

// Get reviews for a meal
router.get('/api/meals/:id/reviews', async (req, res) => {
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
router.post('/api/meals/:id/reviews', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { rating, comment } = req.body;
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
  if (comment != null && typeof comment !== 'string') return res.status(400).json({ message: 'Invalid comment.' });
  const cleanComment = (comment || '').trim();
  if (cleanComment.length > MAX_REVIEW_LENGTH) {
    return res.status(400).json({ message: `Reviews can be at most ${MAX_REVIEW_LENGTH} characters.` });
  }

  try {
    const meals = await getMeals();
    if (!meals.some(m => m.id === req.params.id)) {
      return res.status(404).json({ message: 'Meal not found.' });
    }

    // Check if user already reviewed this meal
    const existing = await db.collection('reviews')
      .where('mealId', '==', req.params.id)
      .where('userId', '==', userId)
      .limit(1).get();

    if (!existing.empty) {
      // Update existing review
      const doc = existing.docs[0];
      await doc.ref.update({ rating: numericRating, comment: cleanComment, updatedAt: new Date().toISOString() });
      return res.json({ message: 'Review updated!', review: { id: doc.id, ...doc.data(), rating: numericRating, comment: cleanComment } });
    }

    // The reviewer's name comes from their account, not the request body, so nobody can post as someone else
    const userSnap = await db.collection('credentials').where('userId', '==', userId).limit(1).get();
    const userName = (!userSnap.empty && userSnap.docs[0].data().name) || 'Anonymous';

    const reviewData = {
      mealId: req.params.id,
      userId,
      userName,
      rating: numericRating,
      comment: cleanComment,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('reviews').add(reviewData);
    res.status(201).json({ message: 'Review submitted!', review: { id: ref.id, ...reviewData } });
  } catch (err) {
    console.error('[Reviews] Submit error:', err);
    res.status(500).json({ message: 'Failed to submit review.' });
  }
});

// Validate coupon (user-facing)
router.post('/api/coupons/validate', couponValidateLimiter, async (req, res) => {
  const { code } = req.body;
  const cartTotal = Number(req.body.cartTotal) || 0;
  if (!isNonEmptyString(code)) return res.status(400).json({ message: 'Promo code is required.' });

  try {
    const snapshot = await couponQuery(code).get();
    if (snapshot.empty) {
      return res.status(404).json({ message: 'Invalid promo code.' });
    }
    const doc = snapshot.docs[0];
    const coupon = doc.data();

    // Same rules POST /api/orders enforces when the order is placed
    const result = evaluateCoupon(coupon, cartTotal);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      maxDiscount: coupon.maxDiscount,
      discount: result.discount,
    });
  } catch (err) {
    console.error('[Coupons] Validate error:', err);
    res.status(500).json({ message: 'Failed to validate coupon.' });
  }
});

export default router;
