import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (!user || !pass || user === 'your-email@gmail.com') {
      console.warn('[Email] EMAIL_USER / EMAIL_PASS not configured. Email OTP will not work.');
      return null;
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendOtpEmail(to, otp) {
  const t = getTransporter();
  if (!t) throw new Error('Email service not configured. Set EMAIL_USER and EMAIL_PASS in .env.');

  const mailOptions = {
    from: `"The Flavor Alchemist" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your OTP Verification Code',
    html: `
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
    `,
  };

  await t.sendMail(mailOptions);
}

export function isEmailConfigured() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  return !!(user && pass && user !== 'your-email@gmail.com');
}
