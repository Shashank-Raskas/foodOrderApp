// RAG phase 5: the account service (read-only, minimal data), per-user LangChain tools, the
// LangGraph account agent, the chat service's tool route, and optional sign-in on POST /api/chat.
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AIMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { getRecentOrders, getLoyaltySummary } from '../services/accountService.js';
import { createAccountTools, ACCOUNT_PAGES } from '../rag/tools/accountTools.js';
import { createAccountAgent, runAccountAgent, AGENT_SYSTEM, MAX_AGENT_STEPS } from '../rag/graph/accountAgent.js';
import { createChatService, REPLIES } from '../rag/chat/chatService.js';
import { db, freshApp, request } from './support/helpers.js';

const NOW = Date.parse('2026-11-23T12:00:00Z');

async function seedOrders() {
  const order = (userId, id, minutesAgo, items, total) =>
    db.collection('orders').doc(id).set({
      id, userId, items, total, subtotal: total, discount: 0, promoCode: null, pointsRedeemed: 0,
      createdAt: new Date(NOW - minutesAgo * 60000).toISOString(),
      customer: { name: 'Asha', email: 'asha@test.com', phone: '+919999999999', street: '1 Road', city: 'Hyderabad', 'postal-code': '500081' },
    });
  await order('alice', 'aaaaaaaa-old', 180, [{ id: 'm22', name: 'Hyderabadi Chicken Biryani', price: '499', quantity: 1 }], 499);
  await order('alice', 'bbbbbbbb-new', 20, [{ id: 'm88', name: 'Pani Puri Platter', price: '199', quantity: 2 }], 398);
  await order('bob', 'cccccccc-bob', 5, [{ id: 'm1', name: 'Mac & Cheese', price: '350', quantity: 1 }], 350);
  await db.collection('loyalty').doc('alice').set({
    points: 137,
    history: [
      { type: 'earned', points: 49, orderId: 'aaaaaaaa-old', date: '2026-11-23T09:00:00Z' },
      { type: 'earned', points: 39, orderId: 'bbbbbbbb-new', date: '2026-11-23T11:40:00Z' },
    ],
  });
}

describe('accountService (read-only, minimal data)', () => {
  it("returns only that customer's orders, newest first, without personal details", async () => {
    await seedOrders();
    const { totalOrders, orders } = await getRecentOrders('alice', 5, NOW);
    expect(totalOrders).toBe(2);
    expect(orders.map((o) => o.orderRef)).toEqual(['BBBBBBBB', 'AAAAAAAA']);
    expect(orders[0]).toEqual({
      orderRef: 'BBBBBBBB', placedAt: '2026-11-23T11:40:00.000Z', minutesAgo: 20,
      items: [{ name: 'Pani Puri Platter', quantity: 2, price: 199 }],
      subtotal: 398, discount: 0, promoCode: null, pointsRedeemed: 0, total: 398,
    });
    // None of the customer's details or ids (the city is checked as the address value, since
    // "Hyderabadi" is also part of a dish name)
    expect(JSON.stringify(orders)).not.toMatch(/asha|street|phone|1 Road|"Hyderabad"|500081|\+91|alice|customer/i);
  });

  it('limits the count, handles customers with no orders, and refuses to run without a user', async () => {
    await seedOrders();
    expect((await getRecentOrders('alice', 1, NOW)).orders).toHaveLength(1);
    expect(await getRecentOrders('nobody', 3, NOW)).toEqual({ totalOrders: 0, orders: [] });
    await expect(getRecentOrders(undefined)).rejects.toThrow(/userId/);
    await expect(getLoyaltySummary('')).rejects.toThrow(/userId/);
  });

  it('summarises loyalty points with the checkout rules', async () => {
    await seedOrders();
    const s = await getLoyaltySummary('alice');
    expect(s).toMatchObject({ points: 137, worthRupees: 13, canRedeem: true, rules: { minimumToRedeem: 50 } });
    expect(s.recent[0]).toEqual({ type: 'earned', points: 39, date: '2026-11-23T11:40:00Z' }); // newest first, no order ids
    expect(await getLoyaltySummary('newbie')).toMatchObject({ points: 0, worthRupees: 0, canRedeem: false, recent: [] });
  });
});

describe('account tools', () => {
  it('are bound to the signed-in user: the model cannot choose whose data to read', async () => {
    await seedOrders();
    const [orders, loyalty] = createAccountTools({ userId: 'alice', now: () => NOW });
    expect([orders.name, loyalty.name]).toEqual(['get_recent_orders', 'get_loyalty_points']);
    // An injected "userId" argument is not part of the schema and is ignored
    const out = JSON.parse(await orders.invoke({ limit: 5, userId: 'bob' }));
    expect(out.orders.map((o) => o.orderRef)).toEqual(['BBBBBBBB', 'AAAAAAAA']);
    expect(JSON.parse(await loyalty.invoke({})).points).toBe(137);
  });

  it('validate their arguments and require a user', async () => {
    const [orders] = createAccountTools({ userId: 'alice' });
    await expect(orders.invoke({ limit: 50 })).rejects.toThrow();
    expect(() => createAccountTools({ userId: null })).toThrow(/userId/);
    expect(Object.keys(ACCOUNT_PAGES)).toEqual(['get_recent_orders', 'get_loyalty_points']);
  });
});

// A scripted tool-calling model: returns the given AI messages in order (the last one repeats),
// recording what it saw. Each reply is a fresh copy, like a real model: LangGraph's messages
// reducer de-duplicates by message id, so reusing one object would silently replace it.
function scriptedModel(replies) {
  const seen = [];
  let i = 0;
  return {
    seen,
    bindTools: jest.fn(() => RunnableLambda.from((messages) => {
      seen.push(messages);
      const reply = replies[Math.min(i++, replies.length - 1)];
      return new AIMessage({ content: reply.content, tool_calls: reply.tool_calls?.map((c) => ({ ...c, id: `${c.id}_${i}` })) });
    })),
  };
}
const callTool = (name, args = {}, id = `call_${name}`) => new AIMessage({ content: '', tool_calls: [{ name, args, id, type: 'tool_call' }] });

async function run(model, userId = 'alice', question = 'Where is my order?', history = []) {
  const graph = createAccountAgent({ model, tools: createAccountTools({ userId, now: () => NOW }) });
  const events = [];
  for await (const e of runAccountAgent({ graph, question, history })) events.push(e);
  return events;
}

describe('account agent (LangGraph: agent ⇄ tools)', () => {
  it('calls a tool, reads its result, then answers', async () => {
    await seedOrders();
    const model = scriptedModel([callTool('get_recent_orders', { limit: 1 }), new AIMessage('Your order BBBBBBBB (2 × Pani Puri Platter, ₹398) was placed 20 minutes ago.')]);
    const events = await run(model);
    const result = events.at(-1);
    expect(result).toEqual({ type: 'result', answer: 'Your order BBBBBBBB (2 × Pani Puri Platter, ₹398) was placed 20 minutes ago.', toolsUsed: ['get_recent_orders'] });
    expect(events.filter((e) => e.type === 'token').map((e) => e.text).join('')).toBe(result.answer);

    // Second model call saw: system prompt, the question, its own tool call, and the tool's result
    const second = model.seen[1];
    expect(second[0].content).toBe(AGENT_SYSTEM);
    expect(second.map((m) => m._getType())).toEqual(['system', 'human', 'ai', 'tool']);
    expect(second[3].content).toContain('BBBBBBBB');
    expect(JSON.stringify(second)).not.toContain('alice'); // the user id never reaches the model
  });

  it('can use both tools in one turn', async () => {
    await seedOrders();
    const both = new AIMessage({ content: '', tool_calls: [
      { name: 'get_loyalty_points', args: {}, id: 'a', type: 'tool_call' },
      { name: 'get_recent_orders', args: { limit: 2 }, id: 'b', type: 'tool_call' },
    ] });
    const events = await run(scriptedModel([both, new AIMessage('You have 137 points and 2 orders.')]));
    expect(events.at(-1).toolsUsed).toEqual(['get_loyalty_points', 'get_recent_orders']);
  });

  it('passes recent chat history to the model', async () => {
    const model = scriptedModel([new AIMessage('You have 0 points.')]);
    await run(model, 'newbie', 'and my points?', [{ role: 'user', content: 'where is my order' }, { role: 'assistant', content: 'You have no orders yet.' }]);
    expect(model.seen[0].map((m) => m._getType())).toEqual(['system', 'human', 'ai', 'human']);
  });

  it('stops a model that keeps calling tools (step limit)', async () => {
    await expect(run(scriptedModel([callTool('get_loyalty_points')]))).rejects.toThrow(/recursion|limit/i);
    expect(MAX_AGENT_STEPS).toBeLessThanOrEqual(8);
  });
});

describe('chat service: tool route', () => {
  const retrieval = RunnableLambda.from(() => ({ route: 'tool', analysis: { intent: 'order_status' }, documents: [], lowConfidence: false, relaxedFilters: false, timings: {} }));
  const collect = async (iter) => {
    const out = [];
    for await (const e of iter) out.push(e);
    return out;
  };

  it('asks guests to sign in, without calling any model', async () => {
    const agentFor = jest.fn();
    const events = await collect(createChatService({ retrieval, answerChain: null, agentFor }).chat({ message: 'Where is my order?', user: null }));
    expect(events.at(-1)).toMatchObject({ type: 'done', answer: REPLIES.signIn, signInRequired: true, route: 'tool' });
    expect(agentFor).not.toHaveBeenCalled();
  });

  it("runs the agent for the signed-in user and links the account pages it used", async () => {
    await seedOrders();
    const model = scriptedModel([callTool('get_recent_orders'), new AIMessage('Your latest order was placed 20 minutes ago.')]);
    const agentFor = jest.fn((userId) => createAccountAgent({ model, tools: createAccountTools({ userId, now: () => NOW }) }));
    const events = await collect(createChatService({ retrieval, answerChain: null, agentFor }).chat({ message: 'Where is my order?', user: { userId: 'alice' } }));
    expect(agentFor).toHaveBeenCalledWith('alice');
    expect(events.at(-1)).toMatchObject({
      type: 'done', route: 'tool', answer: 'Your latest order was placed 20 minutes ago.', mealIds: [], toolsUsed: ['get_recent_orders'],
      citations: [{ n: 1, id: 'account:get_recent_orders', title: 'My Orders', url: '/orders', docType: 'account' }],
    });
    expect(typeof events.at(-1).timings.agent).toBe('number');
  });
});

describe('POST /api/chat sign-in', () => {
  const token = (payload, opts) => jwt.sign(payload, process.env.JWT_SECRET, opts);
  let seenUser;
  async function appWithSpy() {
    const app = await freshApp();
    const { setChatServiceForTests } = await import('../rag/chat/index.js');
    setChatServiceForTests({
      async *chat({ user }) {
        seenUser = user;
        yield { type: 'done', answer: 'ok', citations: [], mealIds: [] };
      },
    });
    return { app, reset: () => setChatServiceForTests(null) };
  }
  afterEach(() => {
    seenUser = undefined;
  });

  it('guests chat without a token', async () => {
    const { app, reset } = await appWithSpy();
    expect((await request(app).post('/api/chat').send({ message: 'hi' })).status).toBe(200);
    expect(seenUser).toBeNull();
    reset();
  });

  it('a valid token identifies the customer', async () => {
    const { app, reset } = await appWithSpy();
    const res = await request(app).post('/api/chat').set('Authorization', `Bearer ${token({ userId: 'alice', email: 'a@test.com', role: 'user' })}`).send({ message: 'where is my order' });
    expect(res.status).toBe(200);
    expect(seenUser).toEqual({ userId: 'alice', email: 'a@test.com', role: 'user' });
    reset();
  });

  it('an expired or forged token is rejected (so the app refreshes it) instead of being treated as a guest', async () => {
    const { app, reset } = await appWithSpy();
    const expired = await request(app).post('/api/chat').set('Authorization', `Bearer ${token({ userId: 'alice' }, { expiresIn: -10 })}`).send({ message: 'hi' });
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('TOKEN_EXPIRED');
    const forged = await request(app).post('/api/chat').set('Authorization', `Bearer ${jwt.sign({ userId: 'bob' }, 'wrong-secret')}`).send({ message: 'hi' });
    expect(forged.status).toBe(401);
    expect(seenUser).toBeUndefined();
    reset();
  });
});
