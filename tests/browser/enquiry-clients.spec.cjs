const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('log enquiry offers an existing client and saves new requirements with their contact details',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/requests/new');
 await expect(page.getByRole('button',{name:/^(New client|Existing client)$/})).toHaveCount(0);
 const select=page.getByRole('combobox',{name:'Existing client',exact:true});
 await select.selectOption({label:'Northstar Studio · Sam Taylor (sam@example.com)'});
 await expect(page.getByLabel('Full name')).toHaveValue('Sam Taylor');
 await expect(page.getByLabel('Email address (optional)',{exact:true})).toHaveValue('sam@example.com');
 await expect(page.getByLabel('Company / organization name',{exact:true})).toHaveValue('Northstar Studio');
 await page.locator('label.choice-card').filter({hasText:/^Website$/}).click();
 await page.getByLabel('Project goals').fill('A second website for our new product.');
 await page.getByRole('button',{name:'Save lead record'}).click();
 await expect(page.getByRole('heading',{name:'Enquiry logged.'})).toBeVisible();
 const changes=calls.flatMap(call=>call.p_changes);expect(changes).toHaveLength(1);
 expect(changes[0].collection).toBe('leads');expect(changes[0].id).not.toBe('LEAD-TEST-001');
 expect(changes[0].data.row).toMatchObject({full_name:'Sam Taylor',company_name:'Northstar Studio',email:'sam@example.com',description:'A second website for our new product.',status:'NEW'});
});

test('switching to new client clears existing identity and preserves project requirements',async({page})=>{
 await mockWorkspace(page);await page.goto('/requests/new');
 await page.getByRole('combobox',{name:'Existing client',exact:true}).selectOption({label:'Northstar Studio · Sam Taylor (sam@example.com)'});
 await page.getByLabel('Project goals').fill('Keep these project requirements.');
 await page.getByRole('combobox',{name:'Existing client',exact:true}).selectOption('');
 await expect(page.getByLabel('Full name')).toHaveValue('');await expect(page.getByLabel('Full name')).toBeEditable();
 await expect(page.getByLabel('Email address (optional)',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Project goals')).toHaveValue('Keep these project requirements.');
 await expect(page.getByRole('combobox',{name:'Existing client',exact:true})).toHaveValue('');
});

test('optional existing client dropdown aligns with the contact fields and fits narrow screens',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/requests/new');
 await page.getByRole('button',{name:'Save lead record'}).click();expect(calls).toHaveLength(0);
 const selector=page.locator('.enquiry-client-selection');
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:900});
  expect(await selector.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  const dropdown=await page.getByRole('combobox',{name:'Existing client',exact:true}).boundingBox();
  const name=await page.getByLabel('Full name').boundingBox();
  expect(Math.abs(dropdown.x-name.x)).toBeLessThanOrEqual(1);
 }

});
