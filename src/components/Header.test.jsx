import { screen, act } from '@testing-library/react';
import Header from './Header';
import { renderWithProviders } from '../test/utils';

const html = document.documentElement;

describe('Header theme toggle', () => {
  it('starts in the dark theme and switches to light, remembering the choice', () => {
    renderWithProviders(<Header />);
    expect(html.dataset.theme).toBeUndefined(); // dark is the default (no attribute)

    // Desktop button (the hamburger-menu copy has the same label)
    const [toggle] = screen.getAllByRole('button', { name: 'Switch to light theme' });
    act(() => toggle.click());

    expect(html.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(screen.getAllByRole('button', { name: 'Switch to dark theme' }).length).toBeGreaterThan(0);

    act(() => screen.getAllByRole('button', { name: 'Switch to dark theme' })[0].click());
    expect(html.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('shows the light theme as current when the page loaded in light mode', () => {
    html.dataset.theme = 'light'; // what index.html's early script does for a saved choice
    renderWithProviders(<Header />);
    expect(screen.getAllByRole('button', { name: 'Switch to dark theme' }).length).toBeGreaterThan(0);
  });
});
