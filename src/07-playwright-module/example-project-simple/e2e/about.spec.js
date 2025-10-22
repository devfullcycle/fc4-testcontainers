import { test, expect } from '@playwright/test';

test.describe('About Page', () => {
  test('should display about information', async ({ page }) => {
    await page.goto('/about');
    
    await expect(page).toHaveTitle('About Page');
    await expect(page.locator('h1')).toHaveText('About Us');
    await expect(page.locator('p')).toContainText('This is the about page');
  });

  test('should navigate back to home', async ({ page }) => {
    await page.goto('/about');
    
    await page.click('text=Go to Home');
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('Welcome to Express App');
  });
});
