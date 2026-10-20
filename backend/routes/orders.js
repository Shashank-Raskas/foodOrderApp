import { v4 as uuidv4 } from 'uuid';
import db from '../firebase.js';
import { authenticate } from '../middleware/auth.js';
import { createRouter, HttpError, isNonEmptyString, roundMoney } from '../lib/router.js';
import { getMeals } from '../services/mealsService.js';
import { couponQuery, evaluateCoupon } from '../services/couponService.js';
import { sendOrderConfirmationEmail, isEmailConfigured } from '../services/emailService.js';

const router = createRouter();

const MAX_QUANTITY_PER_ITEM = 99;
const MIN_REDEEM_POINTS = 50;

/**
 * Turn the cart sent by the browser into order lines priced from the menu.
 * The browser only decides *which* meals and *how many* — never the price.
 */
async function priceItems(cartItems) {
  const menu = await getMeals();
  const menuById = new Map(menu.map((meal) => [meal.id, meal]));

  return cartItems.map((cartItem) => {
    const meal = menuById.get(cartItem?.id);
    if (!meal) {
      const name = typeof cartItem?.name === 'string' ? cartItem.name : 'An item in your cart';
      throw new HttpError(400, `${name} is no longer on the menu. Please remove it from your cart and try again.`);
    }
    const quantity = Number(cartItem.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      throw new HttpError(400, `Invalid quantity for ${meal.name}.`);
    }
    return { ...meal, quantity };
  });
}

router.post('/api/orders', authenticate, async (req, res) => {
  const orderData = req.body.order;
  const userId = req.user.userId;

  if (!orderData || !Array.isArray(orderData.items) || orderData.items.length === 0) {
    return res.status(400).json({ message: 'Missing data.' });
  }

  const customer = orderData.customer || {};
  if (
    !isNonEmptyString(customer.email) || !customer.email.includes('@') ||
    !isNonEmptyString(customer.name) ||
    !isNonEmptyString(customer.street) ||
    !isNonEmptyString(customer['postal-code']) ||
    !isNonEmptyString(customer.city)
  ) {
    return res.status(400).json({
      message: 'Missing data: Email, name, street, postal code or city is missing.',
    });
  }

  if (orderData.promoCode != null && typeof orderData.promoCode !== 'string') {
    return res.status(400).json({ message: 'Invalid promo code.' });
  }
  const promoCode = orderData.promoCode?.trim() ? orderData.promoCode.trim().toUpperCase() : null;

  // Loyalty points the customer chose to spend on this order (quoted by /api/user/loyalty/redeem)
  const redeemPoints = Math.floor(Number(orderData.redeemPoints) || 0);
  if (redeemPoints < 0 || (redeemPoints > 0 && redeemPoints < MIN_REDEEM_POINTS)) {
    return res.status(400).json({ message: `Minimum ${MIN_REDEEM_POINTS} points required to redeem.` });
  }

  try {
    const items = await priceItems(orderData.items);
    const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));

    const orderRef = db.collection('orders').doc();
    const loyaltyRef = db.collection('loyalty').doc(userId);

    // One transaction: the coupon's usage limit, the loyalty balance and the order are read and written
    // together, so two orders placed at the same moment can't both spend the same points or last coupon use.
    const newOrder = await db.runTransaction(async (t) => {
      // Firestore transactions need every read before any write
      const couponSnap = promoCode ? await t.get(couponQuery(promoCode)) : null;
      const loyaltyDoc = await t.get(loyaltyRef);

      // Promo code — same rules as /api/coupons/validate, enforced again here
      let discount = 0;
      let couponDoc = null;
      if (promoCode) {
        if (couponSnap.empty) throw new HttpError(400, 'Invalid promo code.');
        couponDoc = couponSnap.docs[0];
        const result = evaluateCoupon(couponDoc.data(), subtotal);
        if (!result.ok) throw new HttpError(result.status, result.message);
        discount = result.discount;
      }

      // Loyalty redemption: 10 points = ₹1, never more than what's left to pay
      const current = loyaltyDoc.exists ? loyaltyDoc.data() : { points: 0, history: [] };
      let loyaltyDiscount = 0;
      if (redeemPoints > 0) {
        if ((current.points || 0) < redeemPoints) throw new HttpError(400, 'Not enough loyalty points.');
        loyaltyDiscount = Math.min(Math.floor(redeemPoints / 10), Math.floor(subtotal - discount));
      }
      const pointsRedeemed = loyaltyDiscount * 10;
      const total = roundMoney(Math.max(subtotal - discount - loyaltyDiscount, 0));

      const order = {
        items,
        customer: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          phone: typeof customer.phone === 'string' ? customer.phone.trim() : '',
          street: customer.street.trim(),
          'postal-code': customer['postal-code'].trim(),
          city: customer.city.trim(),
        },
        promoCode: couponDoc ? couponDoc.data().code : null,
        discount,
        loyaltyDiscount,
        pointsRedeemed,
        subtotal,
        total,
        userId: userId,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
      };

      t.set(orderRef, order);

      // Award loyalty points: 1 point per ₹10 spent
      const pointsEarned = Math.floor(total / 10);
      if (pointsEarned > 0 || pointsRedeemed > 0) {
        const date = new Date().toISOString();
        const history = [...(current.history || [])];
        if (pointsRedeemed > 0) {
          history.push({ type: 'redeemed', points: -pointsRedeemed, discount: loyaltyDiscount, orderId: order.id, date });
        }
        if (pointsEarned > 0) {
          history.push({ type: 'earned', points: pointsEarned, orderId: order.id, date });
        }
        t.set(loyaltyRef, {
          points: (current.points || 0) - pointsRedeemed + pointsEarned,
          history: history.slice(-50),
        });
      }

      // Increment coupon usage if a promo code was applied
      if (couponDoc) {
        t.update(couponDoc.ref, { usedCount: (couponDoc.data().usedCount || 0) + 1 });
      }

      return order;
    });

    res.status(201).json({ message: 'Order created!', orderId: newOrder.id, total: newOrder.total });

    // Send order confirmation email — non-blocking, won't fail the order
    if (isEmailConfigured()) {
      sendOrderConfirmationEmail(newOrder.customer.email, newOrder).catch(err =>
        console.error('[Email] Order confirmation failed:', err.message)
      );
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('Failed to save to Firebase:', err);
    res.status(500).json({ message: 'Failed to save order.' });
  }
});

// Get user's order history
router.get('/api/user/orders', authenticate, async (req, res) => {
  const userId = req.user.userId;

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
    res.status(500).json({ message: 'Failed to fetch orders.' });
  }
});

export default router;
