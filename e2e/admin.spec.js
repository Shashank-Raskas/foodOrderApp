import { test, expect } from '@playwright/test';
import { signUpWithPassword, openUserMenu, latestOtp } from './helpers.js';

const ADMIN_EMAIL = 'flavor.alchemist9@gmail.com';

async function loginAsAdmin(page) {
  await page.goto('/');
  // First run creates the admin account (asks for a name); later runs just log in
  await page.getByRole('button', { name: 'Login' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Email Address').fill(ADMIN_EMAIL);
  await modal.getByRole('button', { name: 'Send One Time Password' }).click();
  const otp = await latestOtp(ADMIN_EMAIL);
  const boxes = modal.locator('.otp-box');
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(otp[i]);
  await modal.getByRole('button', { name: 'Verify OTP' }).click();
  const nameField = modal.getByLabel('Full Name');
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill('Admin');
    await modal.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.locator('.profile-avatar-btn')).toBeVisible();
}

test('normal users cannot open the admin dashboard', async ({ page }) => {
  await signUpWithPassword(page);
  await page.goto('/admin');
  await expect(page.getByText('Admin Access Required')).toBeVisible();
});

test('admin: dashboard, coupons and menu management', async ({ page }) => {
  // Make sure there is at least one other customer and order to show
  const customer = await signUpWithPassword(page, { name: 'Visible Customer' });
  await openUserMenu(page).then((m) => m.getByRole('button', { name: /Logout/ }).click());

  await loginAsAdmin(page);
  const menu = await openUserMenu(page);
  await menu.getByRole('button', { name: /Admin/ }).click();
  await expect(page.getByRole('heading', { name: '🔥 Admin Dashboard' })).toBeVisible();

  // Users tab lists real accounts
  await page.getByRole('button', { name: /^Users \(\d+\)$/ }).click();
  await expect(page.getByRole('cell', { name: customer.email })).toBeVisible();

  // Create a coupon through the UI
  await page.getByRole('button', { name: /^Coupons/ }).click();
  await page.getByRole('button', { name: '+ Create Coupon' }).click();
  const couponModal = page.locator('.adm-modal');
  await couponModal.getByPlaceholder('e.g. SAVE20').fill('ADMIN15');
  await couponModal.locator('input[type="number"]').first().fill('15');
  await couponModal.getByRole('button', { name: 'Create Coupon' }).click();
  await expect(page.getByRole('cell', { name: 'ADMIN15' })).toBeVisible();

  // Add a meal through the UI; it appears on the public menu
  await page.getByRole('button', { name: /^Menu \(\d+\)$/ }).click();
  await page.getByRole('button', { name: '+ Add New Meal' }).click();
  const mealModal = page.locator('.adm-modal');
  await mealModal.locator('.adm-form-field', { hasText: 'Name *' }).locator('input').fill('E2E Paneer Roll');
  await mealModal.locator('.adm-form-field', { hasText: 'Price' }).locator('input').fill('199');
  await mealModal.getByRole('button', { name: 'Save Meal' }).click();
  await expect(page.getByRole('cell', { name: 'E2E Paneer Roll' })).toBeVisible();

  await page.goto('/menu');
  await page.locator('.header-search-input').fill('E2E Paneer');
  await expect(page.getByRole('heading', { name: 'E2E Paneer Roll' })).toBeVisible();
  await expect(page.locator('li.meal-item', { hasText: 'E2E Paneer Roll' }).getByText('₹199.00')).toBeVisible();

  // Edit the price, then delete it
  await page.goto('/admin');
  await page.getByRole('button', { name: /^Menu \(\d+\)$/ }).click();
  const row = page.getByRole('row').filter({ hasText: 'E2E Paneer Roll' });
  await row.getByRole('button', { name: 'Edit' }).click();
  await mealModal.locator('.adm-form-field', { hasText: 'Price' }).locator('input').fill('249');
  await mealModal.getByRole('button', { name: 'Save Meal' }).click();
  await expect(row.getByText('₹249.00')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('cell', { name: 'E2E Paneer Roll' })).toHaveCount(0);
});
