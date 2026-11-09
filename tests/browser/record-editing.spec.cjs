const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
for(const role of ['admin','project_manager'])test(`${role} can edit project scope and persist it`,async({page})=>{
 const {calls}=await mockWorkspace(page,{role});await page.goto('/projects/EVE-2026-001');
 await page.getByRole('button',{name:'Edit project',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit project details'});
 await dialog.getByLabel('Description / included scope').fill('Website and booking engine');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).some(change=>change.collection==='projects'&&change.data.row.scope_included==='Website and booking engine')).toBe(true);
});
test('customer edits update linked project and lead without changing saved invoices',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/clients');
 await page.locator('.client-card-summary').filter({hasText:'Northstar Studio'}).click();
 await page.getByRole('button',{name:'Edit customer',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit customer details'});
 await dialog.getByLabel('Contact name',{exact:true}).fill('Sam Updated');
 await dialog.getByLabel('Phone',{exact:true}).fill('+91 9000000000');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 const changes=calls.flatMap(call=>call.p_changes);
 expect(changes.find(change=>change.collection==='projects').data.row.client_name).toBe('Sam Updated');
 expect(changes.find(change=>change.collection==='leads').data.row.phone).toBe('+91 9000000000');
 expect(changes.some(change=>change.collection==='invoices')).toBe(false);
});
test('lead description editing saves the authored description',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/requests/LEAD-TEST-001');
 await page.getByRole('button',{name:'Edit lead details',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit lead details'});
 await dialog.getByLabel('Description',{exact:true}).fill('Website only');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 expect(calls.flatMap(call=>call.p_changes).find(change=>change.collection==='leads').data.row.description).toBe('Website only');
});
test('employees cannot edit project details',async({page})=>{
 await mockWorkspace(page,{role:'employee'});await page.goto('/projects/EVE-2026-001');
 await expect(page.getByRole('heading',{name:'Northstar Studio',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Edit project',exact:true})).toHaveCount(0);
});
test('canceling an edit leaves project details unchanged',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/projects/EVE-2026-001');
 await page.getByRole('button',{name:'Edit project',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit project details'});
 await dialog.getByLabel('Project title',{exact:true}).fill('Unsaved project');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(dialog).not.toBeVisible();expect(calls).toHaveLength(0);
});
test('failed saves keep the form open with an error',async({page})=>{
 await mockWorkspace(page);
 await page.route('**/rest/v1/rpc/save_workspace_changes',route=>route.fulfill({status:503,json:{message:'Temporary database outage'}}));
 await page.goto('/projects/EVE-2026-001');await page.getByRole('button',{name:'Edit project',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit project details'});
 await dialog.getByLabel('Description / included scope').fill('Updated website scope');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Description / included scope')).toHaveValue('Updated website scope');
});
test('an enquiry can be logged without email or phone',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/requests/new');
 await page.getByLabel('Full name').fill('Optional Contact');
 await page.locator('label.choice-card').filter({hasText:/^Website$/}).click();
 await page.locator('select[name=industry]').selectOption({index:1});
 await page.locator('textarea[name=description]').fill('Website project');
 await page.getByRole('button',{name:'Save lead record'}).click();
 await expect(page.getByRole('heading',{name:'Enquiry logged.'})).toBeVisible();
 const lead=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='leads').data.row;
 expect(lead.email).toBe('');expect(lead.phone).toBeNull();
});
