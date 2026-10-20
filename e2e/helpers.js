import { expect } from '@playwright/test';

const CONTROL = 'http://localhost:3101';

// ── Test-only control API (see backend/test/support/e2e-server.js) ──
export async function latestOtp(email) {
  const res = await fetch(`${CONTROL}/otp?destination=${encodeURIComponent(email)}`);
  return (await res.json()).otp;
}
export async function dump(collection) {
  return (await fetch(`${CONTROL}/dump?collection=${collection}`)).json();
}
export async function seed(collection, id, data) {
  await fetch(`${CONTROL}/seed`, { method: 'POST', body: JSON.stringify({ collection, id, data }) });
}

/** A unique email per test so tests never collide in the shared database. */
export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
}

/** The logged-in user as the app stored it. */
export async function storedUser(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('user')));
}

const authModal = (page) => page.getByRole('dialog').filter({ hasText: 'The Flavor Alchemist' });

// ── UI flows ──
export async function signUpWithPassword(page, { name = 'Test User', email = uniqueEmail(), password = 'Secret123' } = {}) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign Up' }).click();
  const modal = authModal(page);
  await modal.getByLabel('Full Name').fill(name);
  await modal.getByLabel('Email Address').fill(email);
  await modal.getByLabel('Password', { exact: true }).fill(password);
  await modal.getByLabel('Confirm Password').fill(password);
  await modal.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('.profile-avatar-btn')).toBeVisible();
  return { name, email, password };
}

export async function loginWithOtp(page, email, name) {
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  const modal = authModal(page);
  await modal.getByLabel('Email Address').fill(email);
  await modal.getByRole('button', { name: 'Send One Time Password' }).click();
  await expect(modal.getByText('Code sent to')).toBeVisible();

  const otp = await latestOtp(email);
  expect(otp).toMatch(/^\d{6}$/);
  const boxes = modal.locator('.otp-box');
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(otp[i]);
  await modal.getByRole('button', { name: 'Verify OTP' }).click();

  if (name) {
    await modal.getByLabel('Full Name').fill(name);
    await modal.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.locator('.profile-avatar-btn')).toBeVisible();
}

export async function openUserMenu(page) {
  await page.locator('.profile-avatar-btn').click();
  return page.locator('.profile-dropdown');
}

/** Add a meal to the cart from the menu page (searching for it first). */
export async function addMealFromMenu(page, mealName, times = 1) {
  await page.goto('/menu');
  await page.locator('.header-search-input').fill(mealName);
  const card = page.locator('li.meal-item').filter({ has: page.getByRole('heading', { name: mealName, exact: true }) });
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Add to Cart' }).click();
  for (let i = 1; i < times; i++) await card.locator('.qty-plus').click();
  await expect(card.locator('.qty-display')).toHaveText(String(times));
  await page.locator('.header-search-input').fill('');
}

export async function openCheckout(page) {
  await page.getByTitle('Cart').click();
  await page.getByRole('button', { name: /Proceed to Checkout/ }).click();
  // The checkout dialog (it switches to the "Order Placed!" view in place, so don't filter on its title)
  const checkout = page.locator('dialog[open]');
  await expect(checkout.getByText('Order Summary')).toBeVisible();
  return checkout;
}

export async function fillNewAddress(checkout, { street = '12 Baker Street', postalCode = '411001', city = 'Pune' } = {}) {
  await checkout.getByPlaceholder('123 Main St, Apt 4').fill(street);
  await checkout.getByPlaceholder('110001').fill(postalCode);
  await checkout.getByPlaceholder('New Delhi').fill(city);
}

export const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
