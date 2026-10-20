import express from 'express';

/**
 * express.Router() whose route handlers may be async.
 * Express 4 ignores the promise an async handler returns, so an unexpected throw outside a try/catch
 * (for example `email.includes` when a client sends a number) became an unhandled rejection that
 * crashed the whole Node process. Rejections are now passed to next(), and app.js answers with a 500.
 */
export function createRouter() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => register(path, ...handlers.map(catchAsync));
  }
  return router;
}

function catchAsync(handler) {
  return function (req, res, next) {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/** Thrown inside handlers/transactions to send a specific status + message to the client. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

/** Round a money amount to 2 decimals. */
export const roundMoney = (value) => Math.round(value * 100) / 100;
