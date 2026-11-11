const {test,expect}=require('@playwright/test');
const {mockWorkspace,tables}=require('./fixtures.cjs');
const partner={name:'Morgan',companyName:'Atlas & Co',email:'morgan@example.com'};
for(const role of ['admin','project_manager'])test(`${role} can link a second client and see the project under both clients`,async({page})=>{
 const {calls}=await mockWorkspace(page,{role});await page.goto('/projects/EVE-2026-001');
 await page.getByRole('button',{name:'Manage clients',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Manage project clients',exact:true});
 await expect(dialog.locator('.project-primary-client')).toContainText('Northstar Studio');
 await dialog.getByRole('checkbox',{name:/Atlas & Co/}).check();
 await dialog.getByRole('button',{name:'Save clients',exact:true}).click();await expect(dialog).not.toBeVisible();
 const saved=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='projects').data.row;
 expect(saved.client_name).toBe('Sam Taylor');expect(saved.client_email).toBe('sam@example.com');
 expect(saved.additional_clients).toEqual([expect.objectContaining(partner)]);
 await page.getByRole('link',{name:'Clients',exact:true}).first().click();
 for(const name of ['Sam Taylor','Morgan']){
  const client=page.locator('.client-card').filter({has:page.locator('.client-card-main > strong',{hasText:name})});
  await client.locator('.client-card-summary').click();await expect(client.getByRole('link',{name:/Northstar website redesign/})).toBeVisible();
 }
});

test('removing a linked client keeps the primary client',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:[{...tables.projects[0],additional_clients:[partner]},tables.projects[1]]}));
 await page.goto('/projects/EVE-2026-001');await page.getByRole('button',{name:'Manage clients',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Manage project clients',exact:true});
 await dialog.getByRole('checkbox',{name:/Atlas & Co/}).uncheck();await dialog.getByRole('button',{name:'Save clients',exact:true}).click();await expect(dialog).not.toBeVisible();
 const saved=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='projects').data.row;
 expect(saved.additional_clients).toEqual([]);expect(saved.client_email).toBe('sam@example.com');
});

test('editing a secondary client does not replace the billing client or edit its enquiry',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:[{...tables.projects[0],additional_clients:[partner]},tables.projects[1]]}));
 await page.goto('/clients');const client=page.locator('.client-card').filter({has:page.locator('.client-card-main > strong',{hasText:'Morgan'})});
 await client.locator('.client-card-summary').click();await client.getByRole('button',{name:'Edit customer',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit customer details'});await dialog.getByLabel('Contact name',{exact:true}).fill('Morgan Updated');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();
 const changes=calls.flatMap(call=>call.p_changes);expect(changes.some(change=>change.collection==='leads')).toBe(false);
 const shared=changes.find(change=>change.id==='EVE-2026-001').data.row;
 expect(shared.client_name).toBe('Sam Taylor');expect(shared.client_email).toBe('sam@example.com');expect(shared.additional_clients[0].name).toBe('Morgan Updated');
});

test('employees cannot change project clients',async({page})=>{
 await mockWorkspace(page,{role:'employee'});await page.goto('/projects/EVE-2026-001');await expect(page.getByRole('button',{name:'Manage clients',exact:true})).toHaveCount(0);
});
