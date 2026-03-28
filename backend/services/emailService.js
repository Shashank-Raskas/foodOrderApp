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

export function isEmailConfigured() {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  return !!apiKey;
}
