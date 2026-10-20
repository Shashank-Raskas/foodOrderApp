import { useContext } from 'react';
import { screen, act, waitFor } from '@testing-library/react';
import CartContext from './CartContext';
import { renderWithProviders, loginAs, sampleMeals } from '../../test/utils';

function CartProbe() {
  const cart = useContext(CartContext);
  return (
    <div>
      <output data-testid="cart">{cart.items.map((i) => `${i.id}x${i.quantity}`).join(',') || 'empty'}</output>
      <button onClick={() => cart.addItem(sampleMeals[0])}>add m1</button>
      <button onClick={() => cart.addItem(sampleMeals[1])}>add m2</button>
      <button onClick={() => cart.removeItem('m1')}>remove m1</button>
      <button onClick={() => cart.clearCart()}>clear</button>
    </div>
  );
}

const cartText = () => screen.getByTestId('cart').textContent;
const click = (name) => act(() => screen.getByRole('button', { name }).click());

describe('CartContext', () => {
  it('adds, increments, decrements and removes items', async () => {
    loginAs();
    renderWithProviders(<CartProbe />);
    await waitFor(() => expect(cartText()).toBe('empty'));

    click('add m1');
    click('add m1');
    click('add m2');
    expect(cartText()).toBe('m1x2,m2x1');

    click('remove m1');
    expect(cartText()).toBe('m1x1,m2x1');
    click('remove m1');
    expect(cartText()).toBe('m2x1');

    click('clear');
    expect(cartText()).toBe('empty');
  });

  it("saves the cart per user and restores it on reload", async () => {
    const user = loginAs();
    const first = renderWithProviders(<CartProbe />);
    await waitFor(() => expect(cartText()).toBe('empty'));
    click('add m2');
    await waitFor(() => expect(JSON.parse(localStorage.getItem(`cart_${user.userId}`))).toHaveLength(1));
    first.unmount();

    renderWithProviders(<CartProbe />);
    await waitFor(() => expect(cartText()).toBe('m2x1'));
  });

  it("doesn't show one user's cart to another", async () => {
    loginAs({ userId: 'someone-else' }, [{ ...sampleMeals[0], quantity: 3 }]);
    localStorage.setItem('user', JSON.stringify({ userId: 'u2', name: 'Bob', email: 'bob@test.com' }));
    renderWithProviders(<CartProbe />);
    await waitFor(() => expect(cartText()).toBe('empty'));
  });
});
