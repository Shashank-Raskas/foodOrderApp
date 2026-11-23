import { test, expect } from '@playwright/test';
import { signUpWithPassword } from './helpers.js';

// The e2e backend has no chatbot keys, so /api/chat answers 503 for real. The streaming tests
// replace that one endpoint with a scripted SSE stream; everything else is the real app + backend.
const sse = (events) => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
const answer = {
  answer: 'Yes! Try the **Hyderabadi Chicken Biryani** (₹499) [1]. Delivery is free above ₹299 [2].',
  citations: [
    { n: 1, id: 'menu:m22', title: 'Hyderabadi Chicken Biryani', section: 'Entrees', url: '/meal/m22', docType: 'menu' },
    { n: 2, id: 'faq:delivery:do-you-charge-for-delivery', title: 'Do you charge for delivery?', section: 'Delivery', url: '/faqs', docType: 'faq' },
  ],
  mealIds: ['m22'],
  route: 'retrieve',
};

async function scriptChat(page, events) {
  const requests = [];
  await page.route('**/api/chat', async (route) => {
    requests.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: sse(events) });
  });
  return requests;
}

const openChat = async (page) => {
  await page.getByRole('button', { name: 'Chat with us' }).click();
  return page.getByRole('dialog', { name: /chat with the flavor alchemist/i });
};

test('without chatbot keys the real backend says the assistant is unavailable', async ({ page }) => {
  await page.goto('/');
  const chat = await openChat(page);
  await chat.getByLabel('Your message').fill('Do you have biryani?');
  await chat.getByLabel('Your message').press('Enter');
  await expect(chat.getByRole('alert')).toHaveText('The chat assistant is not available right now.');
});

test('a guest gets a streamed answer with sources and a dish card; adding it asks them to sign in', async ({ page }) => {
  const requests = await scriptChat(page, [['meta', { route: 'retrieve' }], ['token', { text: answer.answer.slice(0, 30) }], ['token', { text: answer.answer.slice(30) }], ['done', answer]]);
  await page.goto('/menu');
  const chat = await openChat(page);
  await chat.getByRole('button', { name: 'Something spicy and veg under ₹300?' }).click();

  await expect(chat.locator('strong', { hasText: 'Hyderabadi Chicken Biryani' })).toBeVisible();
  await expect(chat.getByRole('link', { name: '1', exact: true })).toHaveAttribute('href', '/meal/m22');
  await expect(chat.getByRole('link', { name: 'Do you charge for delivery? — Delivery' })).toBeVisible();
  expect(requests[0]).toEqual({ body: { message: 'Something spicy and veg under ₹300?', history: [], sessionId: expect.any(String) }, auth: undefined });

  // The card uses the real menu from the backend
  const card = chat.getByRole('list', { name: 'Suggested dishes' }).getByRole('listitem');
  await expect(card).toContainText('Hyderabadi Chicken Biryani');
  await expect(card).toContainText('₹499.00');
  await card.getByRole('button', { name: /Add .* to cart/ }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'The Flavor Alchemist' }).getByLabel('Email Address')).toBeVisible();
});

test('a signed-in customer sends their token and can add the suggested dish to the cart', async ({ page }) => {
  await signUpWithPassword(page);
  const requests = await scriptChat(page, [['done', answer]]);
  const chat = await openChat(page);
  await chat.getByLabel('Your message').fill('biryani?');
  await chat.getByRole('button', { name: 'Send' }).click();
  await chat.getByRole('button', { name: /Add Hyderabadi Chicken Biryani to cart/ }).click();
  await expect(chat.getByRole('button', { name: /Add Hyderabadi Chicken Biryani to cart/ })).toHaveText('Added ✓');
  expect(requests[0].auth).toMatch(/^Bearer /);

  // Following a citation opens the page behind it
  await chat.getByRole('link', { name: 'Do you charge for delivery? — Delivery' }).click();
  await expect(page).toHaveURL(/\/faqs$/);
});

test('on a phone the chat fills the screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scriptChat(page, [['done', answer]]);
  await page.goto('/');
  const chat = await openChat(page);
  // Measure after the short opening animation (it scales from 98%)
  await expect.poll(async () => Math.round((await chat.boundingBox()).width)).toBe(390);
  expect(Math.round((await chat.boundingBox()).x)).toBe(0);
  // The chat sits above the site header, so its own header and close button are usable
  const closeBox = await chat.getByRole('button', { name: 'Close chat' }).boundingBox();
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.chat-panel') !== null, { x: closeBox.x + closeBox.width / 2, y: closeBox.y + closeBox.height / 2 });
  expect(hit).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await chat.getByRole('button', { name: 'Close chat' }).click();
  await expect(page.getByRole('button', { name: 'Chat with us' })).toBeVisible();
});
