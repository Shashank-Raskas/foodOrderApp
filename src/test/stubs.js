// Temporarily override environment variables and globals (like fetch) in a test; setup.js restores them.
const backups = { env: new Map(), globals: new Map() };

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
