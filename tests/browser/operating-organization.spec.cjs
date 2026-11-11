const {test,expect}=require('@playwright/test');
const {mockWorkspace,tables}=require('./fixtures.cjs');

test('choose the operating organization once on a lead and inherit it into the project',async({page})=>{
 const {calls}=await mockWorkspace(page);let organization=null,numberRequest;
 await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:[]}));
 await page.route('**/rest/v1/leads?*',route=>route.fulfill({json:[{...tables.leads[0],project_name:'Client booking platform',operating_company:organization}]}));
 await page.route('**/rest/v1/rpc/reserve_workspace_number',route=>{numberRequest=route.request().postDataJSON();return route.fulfill({json:'SRV-2026-003'});});
 await page.goto('/requests/LEAD-TEST-001');
 const selector=page.getByRole('combobox',{name:'Choose the operating organization for this lead',exact:true});
 await selector.selectOption('Servn');await expect(selector).toHaveCount(0);await expect(page.locator('.operating-organization-value')).toHaveText('Servn');
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).some(change=>change.collection==='leads'&&change.data.row.operating_company==='Servn')).toBe(true);
 organization='Servn';await page.reload();await expect(selector).toHaveCount(0);
 const form=page.locator('.project-create-form');await form.locator('input[name=startDate]').fill('2026-11-11');
 await form.getByRole('button',{name:'Move to Projects',exact:true}).click();await expect(page).toHaveURL(/\/projects\/SRV-2026-003$/);
 const project=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='projects');expect(project.data.row.operating_company).toBe('Servn');expect(numberRequest.p_company).toBe('Servn');
 await page.getByRole('button',{name:'Edit project',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit project details',exact:true});
 await expect(edit.getByRole('combobox',{name:'Operating organization',exact:true})).toHaveCount(0);
 await edit.getByLabel('Project name',{exact:true}).fill('Updated booking platform');await edit.getByRole('button',{name:'Save changes',exact:true}).click();await expect(edit).not.toBeVisible();
 expect(calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='projects').at(-1).data.row.operating_company).toBe('Servn');
});

test('project editing still allows setting an operating organization for a legacy project without one',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.route('**/rest/v1/leads?*',route=>route.fulfill({json:[{...tables.leads[0],operating_company:null}]}));await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:[{...tables.projects[0],operating_company:null}]}));
 await page.goto('/projects/EVE-2026-001');await page.getByRole('button',{name:'Edit project',exact:true}).click();
 const edit=page.getByRole('dialog',{name:'Edit project details',exact:true});await edit.getByRole('combobox',{name:'Operating organization',exact:true}).selectOption('Servn');
 await edit.getByRole('button',{name:'Save changes',exact:true}).click();await expect(edit).not.toBeVisible();
 expect(calls.flatMap(call=>call.p_changes).find(change=>change.collection==='projects').data.row.operating_company).toBe('Servn');
});
