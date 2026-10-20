import { test, expect } from '@playwright/test';

test.describe('browsing as a guest', () => {
  test('home page loads with real meal images from the backend', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    await expect(page).toHaveTitle('The Flavor Alchemist');
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

    // Meal images are lazy-loaded; force them to load and check at least one arrives from the backend
    const mealImages = page.locator('img[src*="/images/"]');
    await expect(mealImages.first()).toBeAttached();
    await mealImages.evaluateAll((imgs) => imgs.forEach((img) => { img.loading = 'eager'; }));
    await expect.poll(() => mealImages.evaluateAll((imgs) => imgs.some((img) => img.complete && img.naturalWidth > 0))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('menu lists meals 12 per page, with pagination and search', async ({ page }) => {
    await page.goto('/menu');
    const cards = page.locator('li.meal-item');
    await expect(cards).toHaveCount(12);
    await expect(page.getByRole('heading', { name: 'Mac & Cheese', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByRole('heading', { name: 'Mac & Cheese', exact: true })).toHaveCount(0);

    // Search matches names and descriptions (debounced by 300ms)
    await page.locator('.header-search-input').fill('biryani');
    await expect(cards.first().locator('h3')).toContainText(/biryani/i);
    const results = await cards.evaluateAll((items) => items.map((li) => li.textContent.toLowerCase()));
    expect(results.length).toBeGreaterThan(1);
    expect(results.length).toBeLessThan(12);
    for (const text of results) expect(text).toContain('biryani');
  });

  test('meal detail page shows the meal and the reviews section', async ({ page }) => {
    await page.goto('/meal/m1');
    await expect(page.getByRole('heading', { name: 'Mac & Cheese' })).toBeVisible();
    await expect(page.getByText('₹350.00').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ratings & Reviews' })).toBeVisible();
    await expect(page.getByText('Login to leave a review')).toBeVisible();
  });

  test('adding to cart as a guest asks to log in', async ({ page }) => {
    await page.goto('/menu');
    await page.locator('li.meal-item').first().getByRole('button', { name: 'Add to Cart' }).click();
    await expect(page.getByRole('dialog').getByText('Login with a one-time password')).toBeVisible();
  });

  test('unknown pages show the 404 page', async ({ page }) => {
    await page.goto('/definitely/not/a/page');
    await expect(page.getByRole('heading', { name: '404 Not Found' })).toBeVisible();
    // Header and footer still render around it
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('info and policy pages load (split into their own chunks)', async ({ page }) => {
    for (const [path, heading] of [
      ['/about', 'About Us'],
      ['/contact', /Contact/],
      ['/faqs', 'Frequently Asked Questions'],
      ['/privacy-policy', /Privacy/],
      ['/terms', /Terms/],
      ['/refund-policy', /Refund/],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
  });

  test('protected pages send guests to the home page', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL('/');
  });
});
