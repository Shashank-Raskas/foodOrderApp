import { useContext, useEffect } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Checkout from './Checkout';
import UserProgressContext from './store/UserProgressContext';
import { renderWithProviders, loginAs, mockFetch, callsTo, sampleMeals } from '../test/utils';

function OpenCheckout() {
  const progress = useContext(UserProgressContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- open once on mount
  useEffect(() => { progress.showCheckout(); }, []);
  return null;
}

function setup({ points = 0, addresses = [], orderResponse } = {}) {
  loginAs({}, [{ ...sampleMeals[0], quantity: 2 }, { ...sampleMeals[1], quantity: 1 }]);
  const fetchMock = mockFetch([
    ['GET', '/api/user/addresses', () => ({ addresses })],
    ['POST', '/api/user/addresses', (body) => ({ status: 201, body: { address: { id: 'a-new', ...body.address } } })],
    ['GET', '/api/user/loyalty', () => ({ points, history: [] })],
    ['POST', '/api/user/loyalty/redeem', (body) => ({ discount: Math.floor(body.points / 10), points: Math.floor(body.points / 10) * 10, remainingPoints: points - Math.floor(body.points / 10) * 10 })],
    ['POST', '/api/coupons/validate', (body) => body.code === 'SAVE10'
      ? { valid: true, code: 'SAVE10', type: 'percent', value: 10, maxDiscount: 0, discount: body.cartTotal / 10 }
      : { status: 404, body: { message: 'Invalid promo code.' } }],
    ['PUT', '/api/user/contact', () => ({ message: 'Contact updated!' })],
    ['POST', '/api/orders', orderResponse || (() => ({ status: 201, body: { message: 'Order created!', orderId: 'o1', total: 1000 } }))],
  ]);
  renderWithProviders(<><OpenCheckout /><Checkout /></>);
  return fetchMock;
}

async function fillNewAddress(user) {
  await user.type(await screen.findByPlaceholderText('123 Main St, Apt 4'), '12 Baker Street');
  await user.type(screen.getByPlaceholderText('110001'), '411001');
  await user.type(screen.getByPlaceholderText('New Delhi'), 'Pune');
}

describe('Checkout', () => {
  it('shows the order summary and prefills contact details', async () => {
    setup();
    expect(await screen.findByText('Subtotal (3 items)')).toBeInTheDocument();
    // 2 × 350 + 499
    expect(screen.getAllByText('₹1,199.00').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Your name')).toHaveValue('Alice');
    expect(screen.getByPlaceholderText('your@email.com')).toHaveValue('alice@test.com');
  });

  it('places an order with a new address and saves the address', async () => {
    const user = userEvent.setup();
    const fetchMock = setup();
    await fillNewAddress(user);
    await user.click(screen.getByRole('button', { name: /Place Order/ }));

    expect(await screen.findByText('Order Placed!')).toBeInTheDocument();
    const [order] = callsTo(fetchMock, 'POST', '/api/orders');
    expect(order.headers.Authorization).toBe('Bearer access-1');
    expect(order.body.order.items.map((i) => [i.id, i.quantity])).toEqual([['m1', 2], ['m2', 1]]);
    expect(order.body.order.customer).toMatchObject({ name: 'Alice', email: 'alice@test.com', street: '12 Baker Street', 'postal-code': '411001', city: 'Pune' });
    expect(order.body.order.redeemPoints).toBe(0);

    const [saved] = callsTo(fetchMock, 'POST', '/api/user/addresses');
    expect(saved.body.address).toMatchObject({ street: '12 Baker Street', isDefault: true });
  });

  it('requires an address before placing the order', async () => {
    const user = userEvent.setup();
    const fetchMock = setup();
    await screen.findByPlaceholderText('123 Main St, Apt 4');
    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    expect(await screen.findByText('Street is required')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/orders')).toHaveLength(0);
  });

  it('applies a promo code and sends it with the order', async () => {
    const user = userEvent.setup();
    const fetchMock = setup();
    await fillNewAddress(user);
    await user.type(screen.getByPlaceholderText('Enter promo code'), 'save10');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('You save ₹119.90')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Place Order • ₹1,079\.10/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    await screen.findByText('Order Placed!');
    expect(callsTo(fetchMock, 'POST', '/api/orders')[0].body.order.promoCode).toBe('SAVE10');
  });

  it('shows an error for an invalid promo code', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(await screen.findByPlaceholderText('Enter promo code'), 'BOGUS');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Invalid promo code.')).toBeInTheDocument();
  });

  it('redeeming points only applies them; they are sent with the order to be spent', async () => {
    const user = userEvent.setup();
    const fetchMock = setup({ points: 235 });
    await fillNewAddress(user);

    const loyaltySection = (await screen.findByText(/You have/)).closest('.checkout-loyalty-section');
    await user.click(within(loyaltySection).getByRole('button', { name: 'Redeem' }));

    expect(await screen.findByText('-₹23.00 discount applied!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Place Order • ₹1,176\.00/ }));
    await screen.findByText('Order Placed!');

    expect(callsTo(fetchMock, 'POST', '/api/user/loyalty/redeem')[0].body).toEqual({ points: 235 });
    expect(callsTo(fetchMock, 'POST', '/api/orders')[0].body.order.redeemPoints).toBe(230);
  });

  it('shows the server message when the order is rejected', async () => {
    const user = userEvent.setup();
    setup({ orderResponse: () => ({ status: 400, body: { message: 'Margherita Pizza is no longer on the menu. Please remove it from your cart and try again.' } }) });
    await fillNewAddress(user);
    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    expect(await screen.findByText(/no longer on the menu/)).toBeInTheDocument();
    expect(screen.queryByText('Order Placed!')).not.toBeInTheDocument();
  });

  it('uses a saved default address', async () => {
    const user = userEvent.setup();
    const fetchMock = setup({ addresses: [
      { id: 'a1', label: 'Work', street: '5 Office Park', city: 'Mumbai', postalCode: '400001', isDefault: true, phone: '+919800000000' },
      { id: 'a2', label: 'Home', street: '9 Home Lane', city: 'Pune', postalCode: '411001', isDefault: false },
    ] });
    expect(await screen.findByText('5 Office Park')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText('9876543210')).toHaveValue('9800000000'));

    await user.click(screen.getByRole('button', { name: /Place Order/ }));
    await screen.findByText('Order Placed!');
    expect(callsTo(fetchMock, 'POST', '/api/orders')[0].body.order.customer).toMatchObject({ street: '5 Office Park', city: 'Mumbai', 'postal-code': '400001', phone: '+919800000000' });
  });
});
