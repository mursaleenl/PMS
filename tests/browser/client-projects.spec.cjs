const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('add another project from the client without changing the original project or invoice',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.route('**/rest/v1/rpc/reserve_workspace_number',route=>route.fulfill({json:'EVE-2026-003'}));
 await page.goto('/clients');
 const client=page.locator('.client-card').filter({hasText:'Sam Taylor'});
 await client.locator('.client-card-summary').click();
 await client.getByRole('button',{name:'Add project',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Add project for existing client'});
 await expect(form.getByRole('combobox',{name:'Client',exact:true})).toHaveValue('0');
 await form.getByLabel('Project name',{exact:true}).fill('Northstar mobile app');
 await form.getByRole('combobox',{name:'Project manager',exact:true}).selectOption('00000000-0000-0000-0000-000000000001');
 await form.getByLabel('Scope / description').fill('Design and develop a mobile app.');
 await form.getByLabel('Project budget').fill('5000');
 await form.getByLabel('Services',{exact:true}).fill('UI/UX, Development');
 await form.getByRole('button',{name:'Create project',exact:true}).click();
 await expect(form).not.toBeVisible();
 await expect(client.getByRole('heading',{name:'Associated projects (2)'})).toBeVisible();
 await expect(client.getByRole('link',{name:/Northstar mobile app/})).toBeVisible();
 await expect(client.getByRole('link',{name:/Northstar website redesign/})).toBeVisible();
 const changes=calls.flatMap(call=>call.p_changes);
 expect(changes).toHaveLength(1);
 expect(changes[0].id).toBe('EVE-2026-003');
 expect(changes[0].data.leadId).toBeNull();
 expect(changes[0].data.row).toMatchObject({title:'Northstar mobile app',client_name:'Sam Taylor',client_company:'Northstar Studio',client_email:'sam@example.com',classification:'Repeat Client',contracted_value:5000,scope_included:'Design and develop a mobile app.'});
 expect(changes[0].data.proposalVersion).toBe(0);
 expect(changes[0].data.workItems).toEqual([]);
 expect(changes[0].data.team).toEqual([expect.objectContaining({user_id:'00000000-0000-0000-0000-000000000001',role:'Project Manager'})]);
});

test('new project offers existing clients and keeps their workspaces distinct',async({page})=>{
 const {calls}=await mockWorkspace(page);let numberRequest;
 await page.route('**/rest/v1/rpc/reserve_workspace_number',route=>{numberRequest=route.request().postDataJSON();return route.fulfill({json:'SRV-2026-003'});});
 await page.goto('/projects');
 await page.getByRole('button',{name:'New project',exact:true}).click();
 await page.getByRole('button',{name:/Existing client/}).click();
 const form=page.getByRole('dialog',{name:'Add project for existing client'});
 await expect(form.getByRole('combobox',{name:'Client',exact:true}).locator('option')).toHaveCount(3);
 await form.getByRole('combobox',{name:'Client',exact:true}).selectOption({label:'Northstar Studio · Sam Taylor (sam@example.com)'});
 await form.getByLabel('Project name').fill('Northstar analytics');
 await form.getByLabel('Operating organization').selectOption('Servn');
 await form.getByRole('button',{name:'Create project',exact:true}).click();
 await expect(page).toHaveURL(/\/projects\/SRV-2026-003$/);
 expect(numberRequest).toMatchObject({p_kind:'project',p_company:'Servn'});
 expect(calls.flatMap(call=>call.p_changes)).toHaveLength(1);
 await page.getByRole('link',{name:'Projects',exact:true}).first().click();
 const newCard=page.locator('.portfolio-card').filter({hasText:'Northstar analytics'});
 await expect(newCard).toHaveCount(1);
 await expect(newCard.getByRole('link',{name:'Invoice',exact:true})).toBeVisible();
 await expect(newCard.getByRole('link',{name:'View invoice',exact:true})).toHaveCount(0);
 await expect(page.locator('.portfolio-card').filter({hasText:'Northstar website redesign'})).toHaveCount(1);
});

test('cancel adding a client project does not save anything',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/clients');
 const client=page.locator('.client-card').filter({hasText:'Sam Taylor'});
 await client.locator('.client-card-summary').click();await client.getByRole('button',{name:'Add project',exact:true}).click();
 const form=page.getByRole('dialog');await form.getByLabel('Project name').fill('Unsaved project');
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});expect(await form.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);}
 await form.getByRole('button',{name:'Cancel',exact:true}).click();expect(calls).toHaveLength(0);
});

test('employees cannot add projects to a client',async({page})=>{
 await mockWorkspace(page,{role:'employee'});await page.goto('/projects');
 await expect(page.getByRole('button',{name:'New project',exact:true})).toHaveCount(0);
 await page.goto('/clients');
 await expect(page.getByRole('button',{name:'Add project',exact:true})).toHaveCount(0);
});
