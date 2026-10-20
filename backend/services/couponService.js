import db from '../firebase.js';
import { roundMoney } from '../lib/router.js';

/** Query for a coupon by its code (codes are stored upper-case). */
export function couponQuery(code) {
  return db.collection('coupons').where('code', '==', code.toUpperCase().trim()).limit(1);
}

/**
 * Apply a coupon's rules to a cart subtotal. Used by both POST /api/coupons/validate (the preview the
 * checkout shows) and POST /api/orders (enforced when the order is saved), so both agree.
 * @returns {{ ok: true, discount: number } | { ok: false, status: number, message: string }}
 */
export function evaluateCoupon(coupon, cartTotal) {
  if (!coupon.active) {
    return { ok: false, status: 400, message: 'This promo code is no longer active.' };
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, status: 400, message: 'This promo code has been fully redeemed.' };
  }
  if (coupon.minOrder > 0 && cartTotal < coupon.minOrder) {
    return { ok: false, status: 400, message: `Minimum order of ₹${coupon.minOrder} required.` };
  }

  let discount = 0;
  if (coupon.type === 'percent') {
    discount = Math.min((cartTotal * coupon.value) / 100, coupon.maxDiscount || Infinity);
  } else {
    discount = coupon.value;
  }

  // A discount can never be more than the cart itself
  return { ok: true, discount: roundMoney(Math.max(Math.min(discount, cartTotal), 0)) };
}
