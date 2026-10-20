import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('phone layout: home, menu and navigation work without horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goto('/menu');
  await expect(page.locator('li.meal-item').first()).toBeVisible();
  const menuOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(menuOverflow).toBeLessThanOrEqual(1);
});
