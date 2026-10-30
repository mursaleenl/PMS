const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('workspace pages render without runtime exceptions and retain the existing shell',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await mockWorkspace(page);
 for(const path of ['/','/requests','/projects','/invoices','/work','/clients','/post-sale','/work/performance']){
  await page.goto(path);await expect(page.locator('.sidebar')).toBeVisible();await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
 }
 expect(errors).toEqual([]);
});
test('a completed task is persisted as an individual project change',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/work');
 await page.getByRole('checkbox',{name:'Mark Review navigation and content structure complete'}).click();
 await expect.poll(()=>calls.length).toBeGreaterThan(0);
 const changes=calls.flatMap(call=>call.p_changes);
 expect(changes).toHaveLength(1);expect(changes[0].collection).toBe('projects');
 expect(changes[0].data.workItems.find(task=>task.external_id==='TASK2').status).toBe('DONE');
});
test('date fields enforce validity and calendar supports keyboard navigation',async({page})=>{
 await mockWorkspace(page);await page.goto('/invoices');await page.getByRole('button',{name:'Generate invoice',exact:true}).click();
 await page.getByRole('tab',{name:'Direct / custom invoice'}).click();
 const date=page.locator('input[name="issueDate"]');await expect(date).toBeVisible();
 await date.fill('2026-02-30');expect(await date.evaluate(input=>input.checkValidity())).toBe(false);
 await date.fill('2026-10-29');expect(await date.evaluate(input=>input.checkValidity())).toBe(true);
 await date.press('ArrowDown');await expect(page.getByRole('dialog',{name:'Choose a date'})).toBeVisible();
 await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 await expect(date).toHaveValue('2026-10-30');await expect(page.getByRole('dialog',{name:'Choose a date'})).not.toBeVisible();
});
test('save failures stay visible and retry the same request identifier',async({page})=>{
 await mockWorkspace(page);let calls=0;const requestIds=[];
 await page.route('**/rest/v1/rpc/save_workspace_changes',async route=>{
  const body=route.request().postDataJSON();requestIds.push(body.p_request_id);calls++;
  if(calls===1)return route.fulfill({status:503,json:{message:'Temporary database outage'}});
  return route.fulfill({json:Object.fromEntries(body.p_changes.map(change=>[`${change.collection}:${change.id}`,1]))});
 });
 await page.goto('/work');await page.getByRole('checkbox',{name:'Mark Review navigation and content structure complete'}).click();
 await expect(page.locator('.workspace-sync-notice[role=alert]')).toContainText('Your changes have not been saved');
 await page.getByRole('button',{name:'Retry saving',exact:true}).click();
 await expect(page.locator('.workspace-sync-notice[role=alert]')).not.toBeVisible();expect(requestIds).toHaveLength(2);expect(requestIds[0]).toBe(requestIds[1]);
});
test('external proposal acceptance waits for acknowledgement and can retry a failure',async({page})=>{
 const token='12345678-1234-1234-1234-123456789012';let posts=0;
 const proposal={version:1,status:'SENT',shareToken:token,proposalTitle:'Website proposal',expiryDate:'2099-12-31',quotedAmount:1000,currency:'USD',billingStructure:'Fixed',depositPercent:20,scopeIncluded:'Design',scopeExcluded:'',deliverables:'Website',paymentTerms:'Within 14 days'};
 await page.route(`**/api/proposals/${token}`,async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{lead:{id:'L1',fullName:'Client',companyName:'Client Co',proposals:[proposal]}}});
  posts++;if(posts===1)return route.fulfill({status:503,json:{error:'Temporary error. Please retry.'}});
  return route.fulfill({json:{success:true}});
 });
 await page.goto(`/proposal/${token}`);await page.getByRole('button',{name:'Accept proposal',exact:true}).click();
 await page.getByLabel('Name of approving contact').fill('Client Approver');await page.getByRole('button',{name:'Submit response'}).click();
 await expect(page.getByText('Temporary error. Please retry.')).toBeVisible();await expect(page.getByText('Thank you. Your response has been recorded.')).not.toBeVisible();
 await page.getByRole('button',{name:'Submit response'}).click();await expect(page.getByText('Thank you. Your response has been recorded.')).toBeVisible();expect(posts).toBe(2);
});
