import { stubEnv } from '../test/stubs';

async function loadApi() {
  jest.resetModules();
  return import('./api.js');
}

describe('API URL', () => {
  it('uses the local backend on localhost', async () => {
    const { API_URL, API_ENDPOINTS } = await loadApi();
    expect(window.location.hostname).toBe('localhost');
    expect(API_URL).toBe('http://localhost:3000');
    expect(API_ENDPOINTS.ORDERS).toBe('http://localhost:3000/api/orders');
    expect(API_ENDPOINTS.MEAL_REVIEWS('m7')).toBe('http://localhost:3000/api/meals/m7/reviews');
  });

  it('VITE_API_URL overrides the detection (trailing slash removed)', async () => {
    stubEnv('VITE_API_URL', 'https://api.example.com/');
    const { API_URL, API_ENDPOINTS } = await loadApi();
    expect(API_URL).toBe('https://api.example.com');
    expect(API_ENDPOINTS.MEALS).toBe('https://api.example.com/meals');
  });
});
