// Read-only views of a customer's own orders and loyalty points, for the chatbot's tools.
// Reads the same collections as GET /api/user/orders and GET /api/user/loyalty (those routes are
// unchanged), but returns only what an answer needs: no name, address, phone or email, because this
// data is sent to an LLM.

import db from '../firebase.js';

const MINUTE = 60 * 1000;

function summarizeOrder(order, now) {
  const placed = new Date(order.createdAt || 0);
  return {
    // A short reference the customer can quote to support (the full id is long)
    orderRef: String(order.id || '').slice(0, 8).toUpperCase(),
    placedAt: order.createdAt || null,
    minutesAgo: order.createdAt ? Math.max(0, Math.round((now - placed) / MINUTE)) : null,
    items: (order.items || []).map((i) => ({ name: i.name, quantity: i.quantity, price: Number(i.price) })),
    subtotal: order.subtotal ?? null,
    discount: order.discount || 0,
    promoCode: order.promoCode || null,
    pointsRedeemed: order.pointsRedeemed || 0,
    total: order.total ?? null,
  };
}

/** The customer's most recent orders, newest first. */
export async function getRecentOrders(userId, limit = 1, now = Date.now()) {
  if (!userId) throw new Error('getRecentOrders needs a userId');
  const snapshot = await db.collection('orders').where('userId', '==', userId).get();
  const orders = [];
  snapshot.forEach((doc) => orders.push({ id: doc.id, ...doc.data() }));
  orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return { totalOrders: orders.length, orders: orders.slice(0, limit).map((o) => summarizeOrder(o, now)) };
}

/** The customer's points balance, what it's worth, and the latest point movements. */
export async function getLoyaltySummary(userId) {
  if (!userId) throw new Error('getLoyaltySummary needs a userId');
  const doc = await db.collection('loyalty').doc(userId).get();
  const data = doc.exists ? doc.data() : { points: 0, history: [] };
  const points = data.points || 0;
  return {
    points,
    // Same rules as checkout: 10 points = ₹1, minimum 50 points to redeem, 1 point per ₹10 spent
    worthRupees: Math.floor(points / 10),
    canRedeem: points >= 50,
    rules: { earn: '1 point per ₹10 spent', redeem: '10 points = ₹1 off', minimumToRedeem: 50 },
    recent: (data.history || []).slice(-5).reverse().map((h) => ({ type: h.type, points: h.points, date: h.date })),
  };
}
