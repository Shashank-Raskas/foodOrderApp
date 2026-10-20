import { describe, it, expect, beforeEach } from '@jest/globals';
import { db, request, freshApp, signup, as } from './support/helpers.js';

let app, alice, bob;
beforeEach(async () => {
  app = await freshApp();
  alice = await signup(app);
  bob = await signup(app, { email: 'bob@test.com', name: 'Bob' });
});

const address = (fields = {}) => ({ label: 'Home', street: '1 Main St', city: 'Pune', postalCode: '411001', ...fields });
const addresses = () => db.dump('addresses');

describe('addresses', () => {
  it('adds, lists and deletes an address', async () => {
    const added = await as(app, alice).post('/api/user/addresses', { address: address({ phone: '+919999999999' }) });
    expect(added.status).toBe(201);
    expect(added.body.address).toMatchObject({ userId: alice.userId, street: '1 Main St', label: 'Home', isDefault: false });

    const list = await as(app, alice).get('/api/user/addresses');
    expect(list.body.addresses).toHaveLength(1);

    const del = await as(app, alice).delete(`/api/user/addresses/${added.body.address.id}`);
    expect(del.status).toBe(200);
    expect(Object.keys(addresses())).toHaveLength(0);
  });

  it('keeps only one default address', async () => {
    const a = await as(app, alice).post('/api/user/addresses', { address: address({ isDefault: true }) });
    const b = await as(app, alice).post('/api/user/addresses', { address: address({ street: '2 Side Rd', isDefault: true }) });
    const list = (await as(app, alice).get('/api/user/addresses')).body.addresses;
    expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([b.body.address.id]);

    // Setting the first one back to default (what the profile page does)
    await as(app, alice).post('/api/user/addresses', { address: { ...a.body.address, isDefault: true } });
    const after = (await as(app, alice).get('/api/user/addresses')).body.addresses;
    expect(after.filter((x) => x.isDefault).map((x) => x.id)).toEqual([a.body.address.id]);
  });

  it('updating keeps the original creation date', async () => {
    const added = (await as(app, alice).post('/api/user/addresses', { address: address() })).body.address;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await as(app, alice).post('/api/user/addresses', { address: { ...added, street: '9 New St' } });
    expect(updated.status).toBe(200);
    const stored = addresses()[added.id];
    expect(stored.street).toBe('9 New St');
    expect(stored.createdAt).toBe(added.createdAt);
    expect(stored.updatedAt).toBeTruthy();
  });

  it("users can't change or delete someone else's address", async () => {
    const added = (await as(app, alice).post('/api/user/addresses', { address: address() })).body.address;

    const overwrite = await as(app, bob).post('/api/user/addresses', { address: { ...added, street: 'Hacked' } });
    expect(overwrite.status).toBe(404);
    const remove = await as(app, bob).delete(`/api/user/addresses/${added.id}`);
    expect(remove.status).toBe(404);

    expect(addresses()[added.id]).toMatchObject({ street: '1 Main St', userId: alice.userId });
    expect((await as(app, bob).get('/api/user/addresses')).body.addresses).toHaveLength(0);
  });

  it('validates input', async () => {
    expect((await as(app, alice).post('/api/user/addresses', { address: address({ street: ' ' }) })).status).toBe(400);
    expect((await as(app, alice).post('/api/user/addresses', { address: address({ city: 5 }) })).status).toBe(400);
    expect((await as(app, alice).post('/api/user/addresses', {})).status).toBe(400);
    expect((await as(app, alice).post('/api/user/addresses', { address: address({ id: 'a/b' }) })).status).toBe(404);
    expect((await as(app, alice).delete('/api/user/addresses/does-not-exist')).status).toBe(404);
  });

  it('requires login', async () => {
    expect((await request(app).get('/api/user/addresses')).status).toBe(401);
  });
});

describe('PUT /api/user/contact', () => {
  it('saves the phone number', async () => {
    const res = await as(app, alice).put('/api/user/contact', { phone: '+919812345678' });
    expect(res.status).toBe(200);
    const user = Object.values(db.dump('credentials')).find((c) => c.userId === alice.userId);
    expect(user.phone).toBe('+919812345678');
  });

  it('rejects a non-string phone', async () => {
    expect((await as(app, alice).put('/api/user/contact', { phone: { evil: true } })).status).toBe(400);
  });
});
