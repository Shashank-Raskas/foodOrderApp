import { test, expect } from '@playwright/test';
import { signUpWithPassword, loginWithOtp, openUserMenu, uniqueEmail, storedUser } from './helpers.js';

test('sign up with a password, log out, and log back in', async ({ page }) => {
  const account = await signUpWithPassword(page, { name: 'Priya Sharma' });
  expect((await storedUser(page)).name).toBe('Priya Sharma');

  const menu = await openUserMenu(page);
  await expect(menu.getByText(account.email)).toBeVisible();
  await menu.getByRole('button', { name: /Logout/ }).click();
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

  await page.getByRole('button', { name: 'Login' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Continue with Password' }).click();
  await modal.getByLabel('Email Address').fill(account.email);
  await modal.getByLabel('Password').fill('WrongPass1');
  await modal.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(modal.getByText('Invalid email or password.')).toBeVisible();

  await modal.getByLabel('Password').fill(account.password);
  await modal.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.locator('.profile-avatar-btn')).toBeVisible();
});

test('a new customer signs up with an email OTP', async ({ page }) => {
  const email = uniqueEmail('otp');
  await page.goto('/');
  await loginWithOtp(page, email, 'Rahul Verma');
  const user = await storedUser(page);
  expect(user).toMatchObject({ email, name: 'Rahul Verma', role: 'user' });
});

test('a logged-in user who reloads a protected page stays on it', async ({ page }) => {
  await signUpWithPassword(page);
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: '📋 Order History' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL('/orders');
  await expect(page.getByText('No orders yet!')).toBeVisible();
});

test('profile: edit name, then manage addresses', async ({ page }) => {
  await signUpWithPassword(page, { name: 'Old Name' });
  await page.goto('/profile');

  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await page.locator('#name').fill('New Name');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByText('New Name').first()).toBeVisible();
  expect((await storedUser(page)).name).toBe('New Name');

  await page.getByRole('button', { name: 'Manage Addresses' }).click();
  for (const [label, street] of [['Home', '1 First Street'], ['Work', '2 Office Park']]) {
    await page.getByRole('button', { name: '+ Add New Address' }).click();
    await page.locator('.addr-label-btn', { hasText: label }).click();
    await page.getByPlaceholder('123 Main St, Apt 4').fill(street);
    await page.getByPlaceholder('110001').fill('411001');
    await page.getByPlaceholder('New Delhi').fill('Pune');
    await page.locator('.addr-form').getByRole('button', { name: /Save|Add/ }).click();
    await expect(page.getByText(street)).toBeVisible();
  }

  const workCard = page.locator('.addr-card, [class*="addr-card"]').filter({ hasText: '2 Office Park' }).first();
  await workCard.getByRole('button', { name: 'Set as Default' }).click();
  await expect(workCard.getByText('✓ Default')).toBeVisible();

  const homeCard = page.locator('.addr-card, [class*="addr-card"]').filter({ hasText: '1 First Street' }).first();
  await homeCard.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('1 First Street')).toHaveCount(0);

  // Survives a reload (it's on the server, not just in the page)
  await page.reload();
  await page.getByRole('button', { name: 'Manage Addresses' }).click();
  await expect(page.getByText('2 Office Park')).toBeVisible();
  await expect(page.getByText('1 First Street')).toHaveCount(0);
});
