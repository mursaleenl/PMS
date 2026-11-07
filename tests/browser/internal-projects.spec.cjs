const { test, expect } = require('@playwright/test');
const { mockWorkspace, tables } = require('./fixtures.cjs');

test('internal projects use the default logo across views and keep custom uploads', async ({ page }) => {
  await mockWorkspace(page);
  await page.route('**/rest/v1/projects?*', route => route.fulfill({ json: [{ ...tables.projects[0], project_type: 'internal', lead_id: null, client_company: null, client_name: null, logo_data_url: null, title: 'Internal design system' }] }));
  await page.goto('/projects');
  await expect(page.locator('.portfolio-card .project-card-logo')).toHaveAttribute('src', '/internal-project-logo.png');
  await page.goto('/');
  await expect(page.locator('.overview-project-card .project-card-logo')).toHaveAttribute('src', '/internal-project-logo.png');
  await expect(page.locator('.overview-project-card .project-card-logo')).toBeVisible();
  await expect(page.locator('.overview-project-card .project-internal-wordmark')).toHaveText('Internal');
  await expect(page.locator('.overview-project-card .company-pill')).toHaveCount(0);
  await expect(page.locator('.overview-task-row .project-card-logo')).toHaveCount(2);
  await expect(page.locator('.overview-task-row .project-card-logo').first()).toHaveAttribute('src', '/internal-project-logo.png');
  await page.goto('/work');
  await expect(page.locator('.task-project-cell .project-card-logo')).toHaveAttribute('src', '/internal-project-logo.png');
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(page.locator('.task-kanban-card .project-card-logo')).toHaveCount(3);
  await expect(page.locator('.task-kanban-card .project-card-logo').first()).toBeVisible();
  await page.goto('/projects/EVE-2026-001');
  await expect(page.locator('.project-workspace-logo')).toHaveAttribute('src', '/internal-project-logo.png');
  await page.getByRole('button', { name: 'Project status', exact: true }).click();
  await expect(page.locator('.project-board-card .project-card-logo')).toHaveAttribute('src', '/internal-project-logo.png');
  await page.locator('.project-logo-upload-compact input[type=file]').setInputFiles('public/internal-project-logo.png');
  await expect(page.locator('.project-workspace-logo')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.locator('.project-board-card .project-card-logo')).toHaveAttribute('src', /^data:image\/png;base64,/);
});

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
