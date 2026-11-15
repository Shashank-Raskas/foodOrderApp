import '@testing-library/jest-dom';
import { cleanup, configure } from '@testing-library/react';
import { restoreStubs } from './stubs';
import { invalidateCache } from '../hooks/useHttp';

// findBy*/waitFor give up after 1s by default, which is too tight when Jest runs several
// test files in parallel on a slower machine (a full checkout flow types into many fields)
configure({ asyncUtilTimeout: 5000 });

// Keep the output readable: the app logs its API config when modules load, and React warns about act()
// in async effects. Run with TEST_LOGS=1 to see them.
if (!process.env.TEST_LOGS) {
  for (const method of ['log', 'warn', 'error']) console[method] = () => {};
}

// index.html has a #modal element that dialogs and the auth modal portal into
beforeEach(() => {
  if (!document.getElementById('modal')) {
    const modal = document.createElement('div');
    modal.id = 'modal';
    document.body.appendChild(modal);
  }
});

afterEach(() => {
  cleanup();
  restoreStubs();
  invalidateCache(); // useHttp keeps GET responses for 5 minutes — don't let one test's menu leak into the next
  localStorage.clear();
  sessionStorage.clear();
});
