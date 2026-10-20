// Runs the real backend (app.js) for the Playwright e2e tests, with Firestore swapped for the
// in-memory fake so tests never touch the real database. Started by playwright.config.js.
//
// It also opens a small test-only control API on E2E_CONTROL_PORT (never part of the real server):
//   GET  /otp?destination=a@b.com      → { otp }      latest code "emailed" to that address
//   GET  /dump?collection=orders       → { id: doc }  read a collection
//   POST /seed { collection, id, data } → write a doc (data: null deletes it)
import { register } from 'node:module';
import http from 'node:http';

register('./fakeFirestoreLoader.js', import.meta.url);
const { default: db } = await import('./fakeFirestore.js');

const controlPort = Number(process.env.E2E_CONTROL_PORT || 3101);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === 'GET' && url.pathname === '/otp') {
      const destination = (url.searchParams.get('destination') || '').toLowerCase();
      const latest = Object.values(db.dump('otps'))
        .filter((d) => d.destination === destination && !d.superseded)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return send(latest ? 200 : 404, { otp: latest?.otp ?? null });
    }
    if (req.method === 'GET' && url.pathname === '/dump') {
      return send(200, db.dump(url.searchParams.get('collection')));
    }
    if (req.method === 'POST' && url.pathname === '/seed') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { collection, id, data } = JSON.parse(raw);
      db.put(collection, id, data);
      return send(200, { ok: true });
    }
    send(404, { message: 'unknown control route' });
  } catch (err) {
    send(500, { message: err.message });
  }
}).listen(controlPort, () => console.log(`[e2e] control API on http://localhost:${controlPort}`));

await import('../../app.js');
