// Environment for the RAG code. Locally the keys live in backend/.env.local (gitignored); on Render
// they are set in the dashboard. dotenv never overrides variables that are already set.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Tests run offline with fakes: never pick up the real keys from .env.local
if (process.env.NODE_ENV !== 'test') dotenv.config({ path: path.join(backendDir, '.env.local'), quiet: true });
dotenv.config({ path: path.join(backendDir, `.env.${process.env.NODE_ENV || 'development'}`), quiet: true });

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (add it to backend/.env.local, or the Render dashboard)`);
  return value;
}

// Downloaded model files are cached here (gitignored), so they are fetched once per machine
export const MODEL_CACHE_DIR = path.join(backendDir, 'rag', '.models');
