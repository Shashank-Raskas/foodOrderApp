import { render, screen } from '@testing-library/react';
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
