import { test, expect } from '@playwright/test';
import { signUpWithPassword, addMealFromMenu, openCheckout, fillNewAddress, seed, dump, storedUser, rupees } from './helpers.js';

// Prices from backend/data/available-meals.json
const MAC = { name: 'Mac & Cheese', price: 350 };
const PIZZA = { name: 'Margherita Pizza', price: 499 };
// Money is rounded to 2 decimals on the server (998 * 0.1 is 99.80000000000001 in JS)
const paise = (n) => Math.round(n * 100) / 100;

test('place an order end to end and see it in order history', async ({ page }) => {
  await signUpWithPassword(page, { name: 'Order Tester' });
  await addMealFromMenu(page, MAC.name, 2);
  await addMealFromMenu(page, PIZZA.name);
  await expect(page.locator('.cart-badge')).toHaveText('3');

  const checkout = await openCheckout(page);
  const total = MAC.price * 2 + PIZZA.price;
  await expect(checkout.getByText('Subtotal (3 items)')).toBeVisible();
  await fillNewAddress(checkout);
  await checkout.locator('input[type="tel"]').fill('9876543210');
  await checkout.getByRole('button', { name: `Place Order • ${rupees(total)}` }).click();

  await expect(checkout.getByText('Order Placed!')).toBeVisible();
  await checkout.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.cart-badge')).toHaveCount(0);

  // Stored on the server with server-side prices
  const user = await storedUser(page);
  const orders = Object.values(await dump('orders')).filter((o) => o.userId === user.userId);
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({ subtotal: total, total, customer: { street: '12 Baker Street', city: 'Pune', phone: '+919876543210' } });

  await page.goto('/orders');
  const card = page.locator('.order-card');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.total-price')).toHaveText(rupees(total));
  await expect(card.getByText('Mac & Cheese')).toBeVisible();
  await expect(card.getByText('12 Baker Street')).toBeVisible();

  // Loyalty points were earned (1 per ₹10)
  const loyalty = (await dump('loyalty'))[user.userId];
  expect(loyalty.points).toBe(Math.floor(total / 10));

  // The address was saved and is offered (with the phone split correctly) at the next checkout
  await addMealFromMenu(page, PIZZA.name);
  const again = await openCheckout(page);
  await expect(again.locator('.address-card.selected')).toContainText('12 Baker Street');
  await expect(again.locator('input[type="tel"]')).toHaveValue('9876543210');
  await expect(again.locator('select.addr-country-select')).toHaveValue('+91');
});

test('promo code and loyalty points are applied, and the server charges the same amount', async ({ page }) => {
  await signUpWithPassword(page, { name: 'Discount Tester' });
  const user = await storedUser(page);
  await seed('coupons', 'e2e-save10', { code: 'SAVE10', type: 'percent', value: 10, maxDiscount: 0, minOrder: 0, maxUses: 0, usedCount: 0, active: true, createdAt: new Date().toISOString() });
  await seed('loyalty', user.userId, { points: 120, history: [] });

  await addMealFromMenu(page, PIZZA.name, 2);
  const checkout = await openCheckout(page);
  await fillNewAddress(checkout);

  await checkout.getByPlaceholder('Enter promo code').fill('save10');
  await checkout.getByRole('button', { name: 'Apply' }).click();
  const subtotal = PIZZA.price * 2;
  const promo = paise(subtotal * 0.1);
  await expect(checkout.getByText(`You save ${rupees(promo)}`)).toBeVisible();

  await checkout.getByRole('button', { name: 'Redeem' }).click();
  await expect(checkout.getByText('-₹12.00 discount applied!')).toBeVisible();

  // Nothing is spent until the order is placed
  expect((await dump('loyalty'))[user.userId].points).toBe(120);

  const total = paise(subtotal - promo - 12);
  await checkout.getByRole('button', { name: `Place Order • ${rupees(total)}` }).click();
  await expect(checkout.getByText('Order Placed!')).toBeVisible();

  const order = Object.values(await dump('orders')).find((o) => o.userId === user.userId);
  expect(order).toMatchObject({ subtotal, discount: promo, loyaltyDiscount: 12, pointsRedeemed: 120, total, promoCode: 'SAVE10' });
  expect((await dump('coupons'))['e2e-save10'].usedCount).toBe(1);
  expect((await dump('loyalty'))[user.userId].points).toBe(Math.floor(total / 10));

  await checkout.getByRole('button', { name: 'Done' }).click();
  await page.goto('/orders');
  await expect(page.locator('.order-card .total-price')).toHaveText(rupees(total));
  await expect(page.getByText(`Saved ${rupees(paise(subtotal - total))}`)).toBeVisible();
});

test('an invalid promo code shows an error and the order still goes through without it', async ({ page }) => {
  await signUpWithPassword(page);
  await addMealFromMenu(page, MAC.name);
  const checkout = await openCheckout(page);
  await checkout.getByPlaceholder('Enter promo code').fill('NOTREAL');
  await checkout.getByRole('button', { name: 'Apply' }).click();
  await expect(checkout.getByText('Invalid promo code.')).toBeVisible();

  await fillNewAddress(checkout);
  await checkout.getByRole('button', { name: `Place Order • ${rupees(MAC.price)}` }).click();
  await expect(checkout.getByText('Order Placed!')).toBeVisible();
});

test('a cart with a meal that was removed from the menu gets a clear error', async ({ page }) => {
  await signUpWithPassword(page);
  const user = await storedUser(page);
  // A stale cart saved before the meal was removed
  await page.evaluate(([uid]) => {
    localStorage.setItem(`cart_${uid}`, JSON.stringify([{ id: 'm-retired', name: 'Retired Special', price: '10', image: 'images/default-meal.jpg', quantity: 1 }]));
  }, [user.userId]);
  await page.reload();

  const checkout = await openCheckout(page);
  await fillNewAddress(checkout);
  await checkout.getByRole('button', { name: /Place Order/ }).click();
  await expect(checkout.getByText(/Retired Special is no longer on the menu/)).toBeVisible();
});

test('a logged-in user can rate a meal', async ({ page }) => {
  await signUpWithPassword(page, { name: 'Reviewer Rao' });
  await page.goto('/meal/m2');
  await page.locator('.star-btn').nth(3).click();
  await page.getByPlaceholder('Write a comment (optional)...').fill('Crispy and fresh');
  await page.getByRole('button', { name: 'Submit Review' }).click();
  await expect(page.getByText('Review submitted!')).toBeVisible();
  const review = page.locator('.review-card').filter({ hasText: 'Crispy and fresh' });
  await expect(review.locator('.review-author')).toHaveText('Reviewer Rao');
  await expect(review.locator('.review-stars')).toHaveText('★★★★☆');
});
