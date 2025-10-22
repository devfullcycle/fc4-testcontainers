import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
  test('should return hello message from API', async ({ request }) => {
    const response = await request.get('/api/hello');
    
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toEqual({ message: 'Hello from API!' });
  });
});
