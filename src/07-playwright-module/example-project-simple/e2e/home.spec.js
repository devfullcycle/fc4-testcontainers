import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should display welcome message', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle('Home Page');
    await expect(page.locator('h1')).toHaveText('Welcome to Express App');
    await expect(page.locator('p')).toContainText('simple Express.js application');
  });

  test('should navigate to about page', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text=Go to About');
    await expect(page).toHaveURL('/about');
    await expect(page.locator('h1')).toHaveText('About Us');
  });
});
