// ===================== Email Service (Brevo HTTP API) =====================
// Uses Brevo (formerly Sendinblue) transactional email API instead of SMTP.
// SMTP ports (465/587) are blocked on many cloud free tiers (Render, Railway, etc.)
// Brevo's HTTP API uses port 443 — works everywhere.
//
// Setup:
//   1. Sign up free at https://brevo.com (300 emails/day free)
//   2. Go to: Settings > SMTP & API > API Keys > Generate
//   3. Set BREVO_API_KEY in your .env / Render env vars
//   4. Set SENDER_EMAIL (must be verified in Brevo — Settings > Senders & IPs)

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function getOtpHtml(otp) {
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#1e1b16;color:#d9e2f1;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#ffc404,#ffab04);padding:24px 28px;text-align:center;">
        <h1 style="margin:0;font-size:22px;color:#2c2306;">🔥 The Flavor Alchemist</h1>
      </div>
      <div style="padding:32px 28px;text-align:center;">
        <p style="margin:0 0 8px;font-size:15px;color:#a8a29e;">Your verification code is</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#ffc404;padding:16px 0;">${otp}</div>
        <p style="margin:16px 0 0;font-size:13px;color:#78716c;">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
      </div>
      <div style="padding:16px 28px;text-align:center;border-top:1px solid #3a332a;">
        <p style="margin:0;font-size:12px;color:#78716c;">If you didn't request this, please ignore this email.</p>
      </div>
    </div>
  `;
}

export async function sendOtpEmail(to, otp) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (process.env.SENDER_EMAIL || 'flavor.alchemist9@gmail.com').trim();

  if (!apiKey) {
    throw new Error('BREVO_API_KEY not configured. Set it in your environment variables.');
  }

  const payload = {
    sender: { name: 'The Flavor Alchemist', email: senderEmail },
    to: [{ email: to }],
    subject: 'Your OTP Verification Code',
    htmlContent: getOtpHtml(otp),
  };

  console.log(`[Email] Sending OTP to ${to} via Brevo API...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const resp = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errorBody = await resp.text();
      console.error(`[Email] Brevo API error ${resp.status}:`, errorBody);
      throw new Error(`Email send failed (${resp.status}): ${errorBody}`);
    }

    const result = await resp.json();
    console.log(`[Email] OTP sent successfully to ${to} — messageId: ${result.messageId}`);
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Email send timed out after 15 seconds.');
    }
    throw err;
  }
}

function getOrderConfirmationHtml(orderData) {
  const { items = [], customer = {}, totalPrice } = orderData;
  const formatPrice = (p) => `₹${parseFloat(p).toFixed(2)}`;

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 14px;color:#d9e2f1;border-bottom:1px solid #3a332a;">${item.name}</td>
      <td style="padding:10px 14px;text-align:center;color:#ffc404;border-bottom:1px solid #3a332a;font-weight:600;">${item.quantity}</td>
      <td style="padding:10px 14px;text-align:right;color:#d9e2f1;border-bottom:1px solid #3a332a;">${formatPrice(item.price * item.quantity)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:540px;margin:0 auto;background:#1e1b16;color:#d9e2f1;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#ffc404,#e0a800);padding:24px 28px;text-align:center;">
        <h1 style="margin:0;font-size:22px;color:#2c2306;font-weight:800;">🔥 The Flavor Alchemist</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#4a3800;">Order Confirmation</p>
      </div>

      <div style="padding:28px 28px 20px;">
        <p style="margin:0 0 6px;font-size:15px;">Hi <strong style="color:#ffc404;">${customer.name || 'there'}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;color:#a09080;">Your order has been placed successfully. We'll get it ready for you shortly!</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr style="background:rgba(255,196,4,0.08);">
              <th style="padding:10px 14px;text-align:left;color:#ffc404;font-size:13px;font-weight:600;border-bottom:2px solid rgba(255,196,4,0.2);">Item</th>
              <th style="padding:10px 14px;text-align:center;color:#ffc404;font-size:13px;font-weight:600;border-bottom:2px solid rgba(255,196,4,0.2);">Qty</th>
              <th style="padding:10px 14px;text-align:right;color:#ffc404;font-size:13px;font-weight:600;border-bottom:2px solid rgba(255,196,4,0.2);">Price</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr style="background:rgba(255,196,4,0.06);">
              <td colspan="2" style="padding:12px 14px;color:#ffc404;font-weight:700;font-size:15px;">Total</td>
              <td style="padding:12px 14px;text-align:right;color:#ffc404;font-weight:700;font-size:15px;">${formatPrice(totalPrice)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,196,4,0.12);border-radius:10px;padding:16px 18px;margin-top:16px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#ffc404;">Delivery Address</p>
          <p style="margin:0;font-size:14px;color:#c5beb5;line-height:1.6;">
            ${customer.street || ''}<br>
            ${customer.city || ''}${customer['postal-code'] ? ', ' + customer['postal-code'] : ''}
          </p>
        </div>
      </div>

      <div style="padding:16px 28px;text-align:center;border-top:1px solid #3a332a;">
        <p style="margin:0;font-size:12px;color:#78716c;">Thank you for ordering with The Flavor Alchemist!</p>
      </div>
    </div>
  `;
}

export async function sendOrderConfirmationEmail(to, orderData) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (process.env.SENDER_EMAIL || 'flavor.alchemist9@gmail.com').trim();

  if (!apiKey) {
    throw new Error('BREVO_API_KEY not configured.');
  }

  const payload = {
    sender: { name: 'The Flavor Alchemist', email: senderEmail },
    to: [{ email: to }],
    subject: '🔥 Order Confirmed — The Flavor Alchemist',
    htmlContent: getOrderConfirmationHtml(orderData),
  };

  console.log(`[Email] Sending order confirmation to ${to} via Brevo API...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errorBody = await resp.text();
      console.error(`[Email] Brevo order confirmation error ${resp.status}:`, errorBody);
      throw new Error(`Email send failed (${resp.status}): ${errorBody}`);
    }

    const result = await resp.json();
    console.log(`[Email] Order confirmation sent to ${to} — messageId: ${result.messageId}`);
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Order confirmation email timed out after 15 seconds.');
    }
    throw err;
  }
}

export function isEmailConfigured() {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  return !!apiKey;
}
