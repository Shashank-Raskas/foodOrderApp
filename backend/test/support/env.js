// A clean environment for every test file: no real email/SMS providers, not "deployed", fixed JWT secrets.
// NODE_ENV=test also makes dotenv look for .env.test, which doesn't exist, so local .env files are ignored.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef';
for (const key of ['RENDER', 'RENDER_EXTERNAL_URL', 'BREVO_API_KEY', 'TWILIO_ACCOUNT_SID', 'ALLOWED_ORIGINS', 'FRONTEND_URL']) {
  delete process.env[key];
}
