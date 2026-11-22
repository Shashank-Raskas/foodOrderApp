// LangChain tools for the signed-in customer's own data.
//
// Authorization is enforced here, in code, not in the prompt: the tools are created per request
// for the user the JWT identified, and their schemas have no user/order-id parameter. Whatever the
// model (or a prompt-injection attempt) asks for, these tools can only ever read this one user's data.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as accountService from '../../services/accountService.js';

export const ACCOUNT_PAGES = {
  get_recent_orders: { title: 'My Orders', url: '/orders' },
  get_loyalty_points: { title: 'Loyalty points', url: '/profile' },
};

export function createAccountTools({ userId, account = accountService, now = () => Date.now() }) {
  if (!userId) throw new Error('Account tools need the signed-in userId');
  return [
    tool(async ({ limit = 1 }) => JSON.stringify(await account.getRecentOrders(userId, limit, now())), {
      name: 'get_recent_orders',
      description:
        "The signed-in customer's most recent orders, newest first: when each was placed (and how many minutes ago), items, quantities, prices, discounts and total. Use for questions about their orders.",
      schema: z.object({ limit: z.number().int().min(1).max(5).optional().describe('How many recent orders to fetch (1–5, default 1)') }),
    }),
    tool(async () => JSON.stringify(await account.getLoyaltySummary(userId)), {
      name: 'get_loyalty_points',
      description: "The signed-in customer's loyalty points balance, what it is worth in rupees, whether it can be redeemed yet, and recent point changes.",
      schema: z.object({}),
    }),
  ];
}
