export async function sendOtpSms(to, otp) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    throw new Error('SMS service not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env.');
  }

  // Dynamic import so Twilio isn't required if not used
  const twilio = (await import('twilio')).default;
  const client = twilio(sid, token);

  await client.messages.create({
    body: `Your Flavor Alchemist verification code is: ${otp}. Valid for 5 minutes.`,
    from,
    to,
  });
}

export function isSmsConfigured() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  return !!(sid && token && from);
}
