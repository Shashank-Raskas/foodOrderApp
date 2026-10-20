import { useContext, useEffect } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from './AuthModal';
import UserProgressContext from './store/UserProgressContext';
import AuthContext from './store/AuthContext';
import { renderWithProviders, mockFetch, callsTo } from '../test/utils';

function OpenAuth({ view }) {
  const progress = useContext(UserProgressContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- open once on mount
  useEffect(() => { progress.showAuth(view); }, []);
  return null;
}

function WhoAmI() {
  const auth = useContext(AuthContext);
  return <output data-testid="who">{auth.user ? `${auth.user.name} (${auth.user.role})` : 'guest'}</output>;
}

const authResponse = (fields) => ({ userId: 'u1', email: 'new@test.com', name: 'New Person', role: 'user', createdAt: '2025-01-01', accessToken: 'a', refreshToken: 'r', ...fields });

function renderModal(view, routes) {
  const fetchMock = mockFetch([['GET', '/api/auth/config', () => ({ emailOtp: true, phoneOtp: false })], ...routes]);
  renderWithProviders(<><OpenAuth view={view} /><AuthModal /><WhoAmI /></>);
  return fetchMock;
}

describe('AuthModal — OTP login', () => {
  it('sends a code, asks a new user for their name, and signs them in with the same code', async () => {
    const user = userEvent.setup();
    const fetchMock = renderModal('login', [
      ['POST', '/api/otp/send', () => ({ message: 'OTP sent to your email!' })],
      ['POST', '/api/otp/verify', (body) => body.name
        ? authResponse({ name: body.name, isNewUser: true })
        : { status: 400, body: { message: 'Name is required for new accounts.', needsName: true } }],
    ]);

    await user.type(await screen.findByLabelText('Email Address'), 'new@test.com');
    await user.click(screen.getByRole('button', { name: 'Send One Time Password' }));

    expect(await screen.findByText(/Code sent to/)).toBeInTheDocument();
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(6);
    for (const [i, digit] of [...'482916'].entries()) await user.type(boxes[i], digit);
    await user.click(screen.getByRole('button', { name: 'Verify OTP' }));

    await user.type(await screen.findByLabelText('Full Name'), 'New Person');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('New Person (user)'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const verifies = callsTo(fetchMock, 'POST', '/api/otp/verify');
    expect(verifies.map((c) => c.body)).toEqual([
      { type: 'email', destination: 'new@test.com', otp: '482916' },
      { type: 'email', destination: 'new@test.com', otp: '482916', name: 'New Person' },
    ]);
    expect(JSON.parse(localStorage.getItem('authTokens'))).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('shows the server error for a wrong code', async () => {
    const user = userEvent.setup();
    renderModal('login', [
      ['POST', '/api/otp/send', () => ({ message: 'sent' })],
      ['POST', '/api/otp/verify', () => ({ status: 400, body: { message: 'Incorrect OTP. Please try again.' } })],
    ]);
    await user.type(await screen.findByLabelText('Email Address'), 'a@test.com');
    await user.click(screen.getByRole('button', { name: 'Send One Time Password' }));
    const boxes = await screen.findAllByRole('textbox');
    for (const [i, digit] of [...'000000'].entries()) await user.type(boxes[i], digit);
    await user.click(screen.getByRole('button', { name: 'Verify OTP' }));
    expect(await screen.findByText('Incorrect OTP. Please try again.')).toBeInTheDocument();
  });

  it('shows the rate-limit message from the server', async () => {
    const user = userEvent.setup();
    renderModal('login', [
      ['POST', '/api/otp/send', () => ({ status: 429, body: { message: 'Too many OTP requests. Please wait a few minutes before trying again.' } })],
    ]);
    await user.type(await screen.findByLabelText('Email Address'), 'a@test.com');
    await user.click(screen.getByRole('button', { name: 'Send One Time Password' }));
    expect(await screen.findByText(/Too many OTP requests/)).toBeInTheDocument();
  });
});

describe('AuthModal — password', () => {
  it('logs in with email and password', async () => {
    const user = userEvent.setup();
    const fetchMock = renderModal('login', [['POST', '/api/login', () => authResponse({ name: 'Alice' })]]);
    await user.click(await screen.findByRole('button', { name: /Continue with Password/ }));
    await user.type(screen.getByLabelText('Email Address'), 'alice@test.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Alice'));
    expect(callsTo(fetchMock, 'POST', '/api/login')[0].body).toEqual({ email: 'alice@test.com', password: 'Secret123' });
  });

  it('validates the signup form before calling the server', async () => {
    const user = userEvent.setup();
    const fetchMock = renderModal('signup', []);
    await user.type(await screen.findByLabelText('Full Name'), 'Al');
    await user.type(screen.getByLabelText('Email Address'), 'al@test.com');
    await user.type(screen.getByLabelText('Password'), 'weak');
    await user.type(screen.getByLabelText('Confirm Password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByText('Password must be at least 6 characters')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/signup')).toHaveLength(0);
  });

  it('signs up and shows server errors such as a duplicate email', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const fetchMock = renderModal('signup', [['POST', '/api/signup', (body) => (++attempt === 1
      ? { status: 400, body: { message: 'User with this email already exists.' } }
      : { status: 201, body: authResponse({ name: body.name, email: body.email }) })]]);

    await user.type(await screen.findByLabelText('Full Name'), 'Alice');
    await user.type(screen.getByLabelText('Email Address'), 'alice@test.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.type(screen.getByLabelText('Confirm Password'), 'Secret123');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByText('User with this email already exists.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Alice (user)'));
    expect(callsTo(fetchMock, 'POST', '/api/signup')[1].body).toEqual({ email: 'alice@test.com', password: 'Secret123', name: 'Alice' });
  });
});
