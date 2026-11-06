const { test, expect } = require('@playwright/test');
const { mockWorkspace, tables } = require('./fixtures.cjs');

test('admin creates internal work without commercial fields', async ({ page }) => {
  const { calls } = await mockWorkspace(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: 'Internal', exact: false }).click();
  const form = page.getByRole('dialog', { name: 'New internal project' });
  await form.getByLabel('Project name').fill('Internal design system');
  await form.getByLabel('Description').fill('Build reusable patterns for our team.');
  await expect(form.getByLabel('Project manager')).toHaveValue('');
  await expect(form.getByLabel('Project manager').locator('option')).toHaveCount(1);
  await form.getByRole('button', { name: 'Create internal project', exact: true }).click();
  await expect.poll(() => calls.flatMap(call => call.p_changes).filter(change => change.collection === 'projects').length).toBe(1);
  const change = calls.flatMap(call => call.p_changes).find(change => change.collection === 'projects');
  expect(change.data.row.project_type).toBe('internal');
  expect(change.data.leadId).toBeNull();
  expect(change.data.row.client_email).toBeNull();
  await expect(page.getByRole('heading', { name: 'Internal design system', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project documents' })).toHaveCount(0);
  await expect(page.getByText('Billing structure', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dispatch task', exact: true })).toBeVisible();
});

test('internal projects stay out of invoice and retainer selection', async ({ page }) => {
  await mockWorkspace(page);
  await page.route('**/rest/v1/projects?*', route => route.fulfill({ json: [{ ...tables.projects[0], project_type: 'internal', lead_id: null, client_company: null, client_name: null, client_email: null, title: 'Internal design system', contracted_value: 0 }] }));
  await page.goto('/projects');
  const card = page.locator('.portfolio-card');
  await expect(card.getByRole('heading', { name: 'Internal design system' })).toBeVisible();
  await expect(card.getByRole('link', { name: /Invoice/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'Mark complete' }).click();
  await expect(card.getByRole('button', { name: 'Move to retainer' })).toHaveCount(0);
  await page.goto('/invoices');
  await page.getByRole('button', { name: 'Generate invoice', exact: true }).click();
  await expect(page.getByText('No projects found', { exact: true })).toBeVisible();
});
