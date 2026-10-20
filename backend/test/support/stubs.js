// Temporarily override environment variables and globals (like fetch) inside a test.
// setup.js restores everything after each test.

// Kept on globalThis so the backups survive jest.resetModules()
const backups = (globalThis.__testStubBackups ??= { env: new Map(), globals: new Map() });

export function stubEnv(key, value) {
  if (!backups.env.has(key)) backups.env.set(key, process.env[key]);
  process.env[key] = value;
}

export function stubGlobal(name, value) {
  if (!backups.globals.has(name)) backups.globals.set(name, globalThis[name]);
  globalThis[name] = value;
}

export function restoreStubs() {
  for (const [key, value] of backups.env) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const [name, value] of backups.globals) globalThis[name] = value;
  backups.env.clear();
  backups.globals.clear();
}

/** Retry an assertion until it passes (for work the server finishes after responding, like emails). */
export async function waitFor(assertion, { timeout = 2000, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await assertion();
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}
