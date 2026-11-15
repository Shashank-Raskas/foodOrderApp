import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { loginAs, mockFetch, sampleMeals } from './test/utils';

function renderApp(route, extraRoutes = []) {
  const fetchMock = mockFetch([
    ['GET', '/api/auth/config', () => ({ emailOtp: true, phoneOtp: false })],
    ['GET', '/meals', () => sampleMeals],
    ['GET', '/api/user/loyalty', () => ({ points: 0, history: [] })],
    ...extraRoutes,
  ]);
  render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
  return fetchMock;
}

describe('routing', () => {
  it('shows the 404 page for unknown URLs (used to crash with a blank page)', async () => {
    renderApp('/this/does/not/exist');
    expect(await screen.findByText('404 Not Found')).toBeInTheDocument();
    expect(screen.getByText('Sorry, the page you requested does not exist.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the menu' })).toHaveAttribute('href', '/menu');
  });

  it('loads lazily-split pages', async () => {
    renderApp('/about');
    expect(await screen.findByText('Welcome to The Flavor Alchemist')).toBeInTheDocument();
  });

  it('shows the menu from the API', async () => {
    renderApp('/menu');
    expect(await screen.findByText('Mac & Cheese')).toBeInTheDocument();
    expect(screen.getByText('Margherita Pizza')).toBeInTheDocument();
  });

  it('sends logged-out visitors away from protected pages', async () => {
    renderApp('/orders');
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByText('📋 Order History')).not.toBeInTheDocument();
  });

  it('keeps a logged-in user on a protected page after a reload (used to bounce to the home page)', async () => {
    loginAs();
    renderApp('/orders', [['GET', '/api/user/orders', () => ({ orders: [] })]]);
    expect(await screen.findByText('📋 Order History')).toBeInTheDocument();
    expect(await screen.findByText('No orders yet!')).toBeInTheDocument();
  });

  it('blocks the admin page for normal users', async () => {
    loginAs({ role: 'user' });
    renderApp('/admin');
    expect(await screen.findByText('Admin Access Required')).toBeInTheDocument();
  });

  it('opens the admin dashboard for admins', async () => {
    loginAs({ role: 'admin', email: 'flavor.alchemist9@gmail.com', name: 'Admin' });
    renderApp('/admin', [
      ['GET', '/api/admin/orders', () => ({ orders: [{ id: 'o1', createdAt: new Date().toISOString(), customer: { name: 'Alice', email: 'alice@test.com' }, items: [{ name: 'Mac & Cheese', price: '350', quantity: 2 }], total: 630 }], count: 1, totalRevenue: '630.00' })],
      ['GET', '/api/admin/users', () => ({ users: [{ id: 'c1', name: 'Alice', email: 'alice@test.com' }], count: 1 })],
      ['GET', '/api/admin/meals', () => ({ meals: sampleMeals })],
      ['GET', '/api/admin/coupons', () => ({ coupons: [] })],
    ]);
    expect(await screen.findByText('🔥 Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Users (1)')).toBeInTheDocument();
    expect(screen.getByText('Menu (2)')).toBeInTheDocument();
    expect(screen.getAllByText('₹630.00').length).toBeGreaterThan(0);
  });
});

describe('landing page → menu', () => {
  const dessert = { ...sampleMeals[0], id: 'm9', name: 'Tiramisu', category: 'desserts', description: 'Coffee-soaked layers' };

  it('the hero search opens the menu filtered by the search term', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.type(await screen.findByLabelText('Search for dishes'), 'pizza');
    await user.click(screen.getByRole('button', { name: 'Find Food' }));

    // Menu page, search box filled in, only matching dishes
    expect(await screen.findByPlaceholderText('Search meals... (Ctrl+K)')).toHaveValue('pizza');
    await waitFor(() => expect(screen.queryByText('Mac & Cheese')).not.toBeInTheDocument());
    expect(screen.getByText('Margherita Pizza')).toBeInTheDocument();
  });

  it('a category tile opens the menu with that category ticked', async () => {
    const user = userEvent.setup();
    renderApp('/', [['GET', '/meals', () => [...sampleMeals, dessert]]]);
    await user.click(await screen.findByRole('button', { name: 'Desserts' }));

    expect(await screen.findByText('Tiramisu')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Mac & Cheese')).not.toBeInTheDocument());
  });

  it('menu cards show a veg / non-veg marker', async () => {
    renderApp('/menu', [['GET', '/meals', () => [sampleMeals[0], { ...sampleMeals[1], id: 'm5', name: 'Chicken Tikka', protein: 'chicken' }]]]);
    const vegCard = (await screen.findByText('Mac & Cheese')).closest('li');
    const nonVegCard = screen.getByText('Chicken Tikka').closest('li');
    expect(vegCard.querySelector('.veg-mark--veg')).toHaveAttribute('title', 'Vegetarian');
    expect(nonVegCard.querySelector('.veg-mark--nonveg')).toHaveAttribute('title', 'Non-vegetarian');
  });
});

describe('order history', () => {
  it('shows what was charged (after discounts) and the saving', async () => {
    loginAs();
    renderApp('/orders', [
      ['GET', '/api/user/orders', () => ({ orders: [
        { id: 'order-0001', createdAt: '2025-03-01T10:00:00.000Z', items: [{ name: 'Mac & Cheese', price: '350', quantity: 2 }], customer: { name: 'Alice', street: '1 Main St', city: 'Pune', 'postal-code': '411001' }, subtotal: 700, discount: 70, loyaltyDiscount: 0, total: 630 },
        { id: 'order-0000', createdAt: '2024-03-01T10:00:00.000Z', items: [{ name: 'Margherita Pizza', price: '499', quantity: 1 }], customer: { name: 'Alice', street: '1 Main St', city: 'Pune', 'postal-code': '411001' } },
      ] })],
    ]);
    expect(await screen.findByText('₹630.00')).toBeInTheDocument();
    expect(screen.getByText('Saved ₹70.00')).toBeInTheDocument();
    // An older order without `total` falls back to the item sum
    expect(screen.getAllByText('₹499.00').length).toBeGreaterThan(0);
  });
});
