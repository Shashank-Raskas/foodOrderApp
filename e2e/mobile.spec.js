import { test, expect } from '@playwright/test';

import { signUpWithPassword } from './helpers.js';

const PHONE_WIDTH = 390;
test.use({ viewport: { width: PHONE_WIDTH, height: 844 }, isMobile: true, hasTouch: true });

// Compare with the phone's real width: in mobile emulation, content that is too wide makes the browser
// zoom out, which also grows window.innerWidth — so scrollWidth - innerWidth can't catch the problem.
async function pageWidth(page) {
  await page.waitForTimeout(300);
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test('phone layout: no sideways scrolling, logged out and logged in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(PHONE_WIDTH);

  await page.goto('/menu');
  await expect(page.locator('li.meal-item').first()).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(PHONE_WIDTH);

  // On phones the theme switch lives in the hamburger menu
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // The menu stays open after switching, so the change is visible straight away
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);

  // Logged in, the header also carries the cart and avatar buttons
  await signUpWithPassword(page);
  for (const path of ['/', '/menu', '/meal/m1', '/orders', '/profile', '/favorites']) {
    await page.goto(path);
    await expect(page.locator('.profile-avatar-btn')).toBeVisible();
    expect(await pageWidth(page), path).toBeLessThanOrEqual(PHONE_WIDTH);
  }
});
