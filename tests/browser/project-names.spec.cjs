const {test,expect}=require('@playwright/test');
const {mockWorkspace,tables}=require('./fixtures.cjs');

test('the enquiry project name persists through project setup and becomes the workspace heading',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:[]}));
 await page.route('**/rest/v1/leads?*',route=>route.fulfill({json:[{...tables.leads[0],project_name:'Northstar mobile app'}]}));
 await page.route('**/rest/v1/rpc/reserve_workspace_number',route=>route.fulfill({json:'EVE-2026-003'}));
 await page.goto('/requests/LEAD-TEST-001');
 const form=page.locator('.project-create-form');
 await expect(form.getByLabel('Project name',{exact:true})).toHaveValue('Northstar mobile app');
 await form.locator('input[name=startDate]').fill('2026-11-11');
 await form.getByRole('button',{name:'Move to Projects',exact:true}).click();
 await expect(page).toHaveURL(/\/projects\/EVE-2026-003$/);
 await expect(page.getByRole('heading',{name:'Northstar mobile app',exact:true})).toBeVisible();
 expect(calls.flatMap(call=>call.p_changes).find(change=>change.collection==='projects').data.row.title).toBe('Northstar mobile app');
 expect(calls.flatMap(call=>call.p_changes).find(change=>change.collection==='leads').data.row.project_name).toBe('Northstar mobile app');
});

test('two projects for one client have distinct names on cards, boards and the client list',async({page})=>{
 await mockWorkspace(page);
 await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:[tables.projects[0],{...tables.projects[1],title:'Northstar mobile app',client_name:'Sam Taylor',client_company:'Northstar Ventures',client_email:'sam@example.com'}]}));
 await page.goto('/projects');
 for(const name of ['Northstar website redesign','Northstar mobile app'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 await expect(page.locator('.portfolio-card').filter({hasText:'Northstar Studio'})).toHaveCount(1);
 await expect(page.locator('.portfolio-card-subtitle')).toHaveText(['Northstar Studio','Northstar Ventures']);
 await page.goto('/projects/EVE-2026-001');await page.getByRole('button',{name:'Project status',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Northstar website redesign',exact:true})).toHaveCount(2);
 await page.goto('/clients');const client=page.locator('.client-card').filter({hasText:'Sam Taylor'});await client.locator('.client-card-summary').click();
 await expect(client.getByRole('link',{name:/Northstar website redesign/})).toBeVisible();await expect(client.getByRole('link',{name:/Northstar mobile app/})).toBeVisible();
 await expect(client.getByRole('list',{name:'Associated organizations'}).getByRole('listitem')).toHaveText(['Northstar Studio','Northstar Ventures']);
 await expect(client.locator('.client-card-organization-count strong')).toHaveText('2');
 await expect(client.locator('.client-card-organization-count small')).toHaveText('Organizations');
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:1000});expect(await client.locator('.client-card-summary').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);}
});

test('client portal cards and project page show project names with the client as context',async({page})=>{
 await mockWorkspace(page,{role:'client'});
 const projects=[{id:'one',external_id:'EVE-001',title:'Website redesign',client_company:'Northstar Studio',status:'ACTIVE',total_tasks:0,completed_tasks:0,tasks:[]},{id:'two',external_id:'EVE-002',title:'Mobile app',client_company:'Northstar Studio',status:'ACTIVE',total_tasks:0,completed_tasks:0,tasks:[]}];
 await page.route('**/api/client/workspace',route=>route.fulfill({json:{projects}}));
 await page.goto('/client/projects');
 await expect(page.getByRole('heading',{name:'Website redesign',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Mobile app',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'View Mobile app',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Mobile app',exact:true})).toBeVisible();
});

test('renaming a project updates its enquiry and linked retainer name',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.route('**/rest/v1/managed_projects?*',route=>route.fulfill({json:[{...tables.managed_projects[0],source_project_id:tables.projects[0].id}]}));
 await page.goto('/projects/EVE-2026-001');await page.getByRole('button',{name:'Edit project',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Edit project details'});
 await form.getByLabel('Project name',{exact:true}).fill('Northstar customer portal');
 await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).not.toBeVisible();
 await expect(page.getByRole('heading',{name:'Northstar customer portal',exact:true})).toBeVisible();
 const changes=calls.flatMap(call=>call.p_changes);
 expect(changes.find(change=>change.collection==='projects').data.row.title).toBe('Northstar customer portal');
 expect(changes.find(change=>change.collection==='leads').data.row.project_name).toBe('Northstar customer portal');
 expect(changes.find(change=>change.collection==='management').data.row.project_title).toBe('Northstar customer portal');
});

test('legacy service titles inherit the logged name and a later explicit project rename stays authoritative',async({page})=>{
 const {calls}=await mockWorkspace(page);let saved;
 await page.route('**/rest/v1/leads?*',route=>route.fulfill({json:[{...tables.leads[0],project_name:'Harmukh booking platform'}]}));
 await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:[{...tables.projects[0],title:'Branding, Website',...(saved||{})}]}));
 await page.goto('/projects');await expect(page.getByRole('heading',{name:'Harmukh booking platform',exact:true})).toBeVisible();
 await page.goto('/projects/EVE-2026-001');await expect(page.getByRole('heading',{name:'Harmukh booking platform',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit project',exact:true}).click();const form=page.getByRole('dialog',{name:'Edit project details'});
 await expect(form.getByLabel('Project name',{exact:true})).toHaveValue('Harmukh booking platform');
 await form.getByLabel('Project name',{exact:true}).fill('Website');
 await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).not.toBeVisible();
 saved=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='projects').data.row;
 expect(saved.enquiry_details.projectNameOverride).toBe(true);
 await page.reload();await expect(page.getByRole('heading',{name:'Website',exact:true})).toBeVisible();
});
