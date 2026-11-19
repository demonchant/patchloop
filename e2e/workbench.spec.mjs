import { test, expect } from '@playwright/test';

test('workbench shows the configured target and current runner state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make the repair earn its pass.' })).toBeVisible();
  await expect(page.locator('#target-repo option')).toContainText('PatchLoop Full Showcase 2');
  await expect(page.locator('#ready-stamp')).toHaveText(/Not ready|Ready/);
  await expect(page.getByLabel('Change request')).toBeVisible();
  await page.getByRole('button', { name: 'Load the showcase challenge' }).click();
  await expect(page.locator('#objective')).toHaveValue(/restore it/);
  expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
});

test('real target browser flow exposes the deliberately seeded restore defect', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4185');
  await page.getByLabel('New task').fill('PatchLoop repair proof');
  await page.getByRole('button', { name: 'Add task' }).click();
  const completeResponse = page.waitForResponse((response) => response.url().includes('/complete') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Mark complete: PatchLoop repair proof' }).click();
  const completion = await completeResponse;
  expect(completion.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Mark active: PatchLoop repair proof' })).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Archived 1' }).click();
  await expect(page.getByText('PatchLoop repair proof')).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Active 1' }).click();
  await expect(page.getByRole('button', { name: 'Mark complete: PatchLoop repair proof' })).toBeVisible();
  await expect(page.locator('.task-row')).not.toHaveClass(/is-complete/);
});
