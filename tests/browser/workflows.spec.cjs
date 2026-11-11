const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('workspace pages render without runtime exceptions and retain the existing shell',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await mockWorkspace(page);
 for(const path of ['/','/requests','/projects','/invoices','/work','/clients','/post-sale','/reviews']){
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
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('checkbox',{name:'Mark Review navigation and content structure incomplete'})).toBeChecked();
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

test('an open board picks up another session task changes without writing them back',async({page})=>{
 const {tables}=require('./fixtures.cjs');
 const {calls}=await mockWorkspace(page);
 let revision=0,status='TO_DO';
 await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:tables.projects.map((p,index)=>index===0?{...p,revision}:p)}));
 await page.route('**/rest/v1/project_work_items?*',route=>route.fulfill({json:tables.project_work_items.map(t=>t.external_id==='TASK2'?{...t,status}:t)}));
 await page.goto('/work');
 const task=page.getByRole('checkbox',{name:/^Mark Review navigation and content structure (in)?complete$/});
 await expect(task).not.toBeChecked();
 revision=1;status='DONE';
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(task).toBeChecked({timeout:10000});
 expect(calls).toHaveLength(0);
});

test('employees see completed-project tasks and can only view Project status',async({page})=>{
 const {tables}=require('./fixtures.cjs');
 await mockWorkspace(page,{role:'employee'});
 await page.route('**/rest/v1/projects?*',route=>route.fulfill({json:tables.projects.map((p,index)=>index===0?{...p,status:'COMPLETED'}:p)}));
 await page.goto('/work');
 await expect(page.getByRole('checkbox',{name:'Mark Review navigation and content structure complete'})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'Mark Build the homepage experience complete'})).toHaveCount(0);
 await page.goto('/projects/EVE-2026-001');
 const tabs=page.getByRole('navigation',{name:'Project room sections'});
 await expect(page.getByRole('combobox',{name:'Assigned project manager',exact:true})).toHaveCount(0);
 await expect(page.locator('.project-team-panel')).toContainText('Assigned project manager');
 await expect(tabs.getByRole('button')).toHaveText(['Overview','Staging & Links','Project status','Messages']);
 await tabs.getByRole('button',{name:'Project status',exact:true}).click();
 await expect(page.getByRole('region',{name:'Completed projects'}).getByRole('heading',{name:'Northstar website redesign',exact:true})).toBeVisible();
 await expect(page.getByLabel('Move project',{exact:true})).toHaveCount(0);
 await expect(page.locator('.project-board-card[draggable="true"]')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Review navigation and content structure',exact:true})).toHaveCount(0);
});

test('admin can change project status by drag and keyboard without a move selector',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/projects/EVE-2026-001');
 await page.getByRole('button',{name:'Project status',exact:true}).click();
 await page.locator('.project-board-card').dragTo(page.getByRole('region',{name:'On track projects'}));
 await expect(page.getByRole('region',{name:'On track projects'}).getByRole('heading',{name:'Northstar website redesign',exact:true})).toBeVisible();
 await expect.poll(()=>calls.length).toBeGreaterThan(0);
 expect(calls.flatMap(call=>call.p_changes)[0].data.row.status).toBe('ON_TRACK');
 await expect(page.getByLabel('Move project',{exact:true})).toHaveCount(0);
 await page.locator('.project-board-card').press('ArrowRight');
 await expect(page.getByRole('region',{name:'Completed projects'}).getByRole('heading',{name:'Northstar website redesign',exact:true})).toBeVisible();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).at(-1).data.row.status).toBe('COMPLETED');
 await page.locator('.project-board-card').press('ArrowRight');
 const drawer=page.getByRole('dialog',{name:'Add retainer plan'});
 await expect(drawer).toBeVisible();
 await drawer.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByRole('region',{name:'Completed projects'}).getByRole('heading',{name:'Northstar website redesign',exact:true})).toBeVisible();
 await page.locator('.project-board-card').press('ArrowRight');
 await drawer.getByLabel('Amount',{exact:true}).fill('1200');
 await drawer.getByRole('combobox',{name:'Billing cycle',exact:true}).selectOption('Annual');
 await drawer.getByRole('button',{name:'Add retainer plan',exact:true}).click();
 await expect(page).toHaveURL(/\/post-sale$/);
 const saved=calls.flatMap(call=>call.p_changes);
 expect(calls.some(call=>call.p_changes.some(change=>change.collection==='projects' && change.data.row.status==='AMC') && call.p_changes.some(change=>change.collection==='management'))).toBe(true);
 expect(saved.filter(change=>change.collection==='management')).toHaveLength(1);
 expect(saved.find(change=>change.collection==='management').data.row.management_amount).toBe(1200);
 expect(calls.flatMap(call=>call.p_changes)[0].data.workItems.find(task=>task.external_id==='TASK1').status).toBe('IN_PROGRESS');
});

test('AMC setup retries a failed save without creating another retainer',async({page})=>{
 await mockWorkspace(page);
 const requests=[];let reservations=0;
 await page.route('**/rest/v1/rpc/reserve_workspace_number',route=>{reservations++;return route.fulfill({json:'AMC-RETRY-001'});});
 await page.route('**/rest/v1/rpc/save_workspace_changes',route=>{
  const body=route.request().postDataJSON();requests.push(body);
  if(requests.length===1)return route.fulfill({status:503,json:{message:'Temporary save failure'}});
  return route.fulfill({json:Object.fromEntries(body.p_changes.map(change=>[`${change.collection}:${change.id}`,change.expectedRevision===null?0:change.expectedRevision+1]))});
 });
 await page.goto('/projects/EVE-2026-001');
 await page.getByRole('button',{name:'Project status',exact:true}).click();
 await page.locator('.project-board-card').dragTo(page.getByRole('region',{name:'AMC projects'}));
 const drawer=page.getByRole('dialog',{name:'Add retainer plan'});
 await drawer.getByLabel('Amount',{exact:true}).fill('900');
 await drawer.getByRole('button',{name:'Add retainer plan',exact:true}).click();
 await expect(drawer.getByRole('alert')).toContainText('Temporary save failure');
 await drawer.getByRole('button',{name:'Add retainer plan',exact:true}).click();
 await expect(page).toHaveURL(/\/post-sale$/);
 expect(reservations).toBe(1);
 expect(requests).toHaveLength(2);
 expect(requests[0].p_request_id).toBe(requests[1].p_request_id);
 expect(requests[0].p_changes).toEqual(requests[1].p_changes);
});

test('statuses have visible icons and high-contrast text without badge boxes',async({page})=>{
 await mockWorkspace(page);await page.goto('/projects');
 const badge=page.locator('.status-badge[data-status="ACTIVE"]').first();
 await expect(badge).toBeVisible();
 await expect(badge.locator('svg')).toBeVisible();
 await expect(badge.locator('svg')).toHaveCSS('width','16px');
 await expect(badge).toHaveCSS('color','rgb(71, 85, 105)');
 await expect(badge).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(badge).toHaveCSS('border-top-width','0px');
 await page.goto('/requests');
 await expect(page.locator('.status-badge[data-status="NEW"]').first().locator('svg')).toBeVisible();
 await page.goto('/work');
 await expect(page.locator('.status-badge[data-status="IN_PROGRESS"]').first().locator('svg')).toBeVisible();
});

test('dispatching an assigned task changes an Active project to On track',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.route('**/rest/v1/project_team_members?*',route=>route.fulfill({json:require('./fixtures.cjs').tables.project_team_members.filter(member=>member.role==='Project Manager')}));
 await page.goto('/projects/EVE-2026-001');
 await page.getByRole('button',{name:'Dispatch task',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Dispatch task',exact:true});
 await drawer.getByRole('textbox',{name:'Task title',exact:true}).fill('Verify assignment status');
 await drawer.getByRole('combobox',{name:/^Assignee/}).selectOption('00000000-0000-0000-0000-000000000002');
 await drawer.getByRole('button',{name:'Dispatch to tasks',exact:true}).click();
 await expect(drawer).not.toBeVisible();
 await expect.poll(()=>calls.length).toBeGreaterThan(0);
 const change=calls.flatMap(call=>call.p_changes).find(item=>item.collection==='projects');
 expect(change.data.row.status).toBe('ON_TRACK');
 expect(change.data.workItems.find(task=>task.title==='Verify assignment status').assignee_user_id).toBe('00000000-0000-0000-0000-000000000002');
 expect(change.data.team.filter(member=>member.user_id==='00000000-0000-0000-0000-000000000002')).toHaveLength(1);
 const panel=page.locator('.project-team-panel');
 await expect(panel.getByRole('heading',{name:'Project Team',exact:true})).toBeVisible();
 await expect(panel.getByRole('combobox',{name:'Assigned project manager',exact:true})).toHaveValue('00000000-0000-0000-0000-000000000001');
 await expect(panel.locator('.project-team-roster li')).toHaveCount(1);
 await expect(panel.locator('.project-team-roster')).toContainText('Jordan Lee');
 await expect(panel.getByRole('combobox')).toHaveCSS('border-radius','0px');
 await expect(page.locator('.project-room-heading .status-badge[data-status="ON_TRACK"]')).toBeVisible();
});

test('new leads go straight to proposals and projects without contact or qualification steps',async({page})=>{
 const {tables}=require('./fixtures.cjs');await mockWorkspace(page);
 const source=tables.leads[0];
 await page.route('**/rest/v1/leads?*',route=>route.fulfill({json:[{...source,id:'older-lead',external_id:'OLDER',full_name:'Older enquiry',status:'NEW',created_at:'2026-10-01T00:00:00Z'},{...source,id:'10000000-0000-0000-0000-000000000009',external_id:'NEWEST',full_name:'New arrival',status:'NEW',created_at:'2026-10-30T00:00:00Z'}]}));
 await page.goto('/requests');
 await expect(page.locator('.lead-record-summary .lead-main > strong')).toHaveText(['New arrival','Older enquiry']);
 await expect(page.locator('body')).not.toContainText(/qualified/i);
 await page.locator('.lead-record-summary').first().click();
 await expect(page.getByRole('combobox',{name:'Good fit',exact:true})).toHaveCount(0);
 await expect(page.getByText(/Discovery call|Qualification notes/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Mark qualified|Save call notes|Disqualify/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Log first contact|Edit date & time|Log now/})).toHaveCount(0);
 await expect(page.getByText(/First contact pending|First contact logged/)).toHaveCount(0);
 await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'Choose operating organization',exact:true})).toBeVisible();
 await page.locator('.lead-expanded').getByRole('link',{name:'Open lead workspace',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Qualification',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Proposal & SOW',exact:true})).toHaveCount(0);
 await expect(page.getByText('Initial team assignment',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Allocation %',{exact:true})).toHaveCount(0);
 await expect(page.locator('select[name="projectManager"]')).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/qualified/i);
 await expect(page.getByRole('form',{name:'Basic proposal generator'})).toHaveCount(0);
 await expect(page.locator('.project-create-form')).toBeVisible();
 await page.goto('/proposals');
 await page.getByRole('button',{name:'Generate proposal',exact:true}).click();
 await page.getByRole('combobox',{name:'Lead',exact:true}).selectOption('NEWEST');
 await expect(page.getByRole('form',{name:'Basic proposal generator'})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/qualified/i);
});

test('retainer details separate model billing and dates into aligned rows',async({page})=>{
 const {tables}=require('./fixtures.cjs');await mockWorkspace(page);
 await page.route('**/rest/v1/managed_projects?*',route=>route.fulfill({json:[{id:'retainer',external_id:'AMC-001',source_project_id:tables.projects[0].id,project_title:'Maintenance plan',client_company:'Northstar Studio',model:'Annual maintenance',management_amount:2000,currency:'INR',billing_cycle:'Annual',period_start:'2026-10-31',status:'ACTIVE',created_at:'2026-10-31T00:00:00Z',revision:0}]}));
 await page.goto('/post-sale');await page.locator('.post-sale-card-summary').click();
 const details=page.locator('.retainer-plan-facts');
 await expect(details.locator('dt')).toHaveText(['Plan model','Billing cycle','Started','Ends']);
 await expect(details.locator('dd')).toHaveCount(4);
 await expect(details.locator('dd').first()).toHaveText('Annual maintenance');
 await expect(details.locator('dd').nth(1)).toHaveText('Annual');
 await expect(details.locator('dd').last()).toContainText('2027');
 await expect(details).toHaveCSS('display','grid');
});

test('editing a retainer recalculates its end date without changing identity or paused status',async({page})=>{
 const {tables}=require('./fixtures.cjs');const {calls}=await mockWorkspace(page);
 const created='2026-10-31T00:00:00Z';
 await page.route('**/rest/v1/managed_projects?*',route=>route.fulfill({json:[{id:'retainer',external_id:'AMC-EDIT',source_project_id:tables.projects[0].id,project_title:'Maintenance plan',client_company:'Northstar Studio',model:'Annual maintenance',management_amount:2000,currency:'INR',billing_cycle:'Annual',period_start:'2026-10-31',status:'PAUSED',created_at:created,revision:0}]}));
 await page.goto('/post-sale');await page.locator('.post-sale-card-summary').click();
 await page.getByRole('button',{name:'Edit plan',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Edit retainer plan'});
 await expect(drawer.getByRole('combobox',{name:'Billing cycle',exact:true}).locator('option')).toHaveText(['Monthly','Quarterly','Annual']);
 await drawer.getByRole('spinbutton',{name:'Amount',exact:true}).fill('2500');
 await drawer.getByRole('combobox',{name:'Plan type',exact:true}).selectOption('Continuous retainer');
 await drawer.getByRole('combobox',{name:'Billing cycle',exact:true}).selectOption('Quarterly');
 await drawer.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(drawer).not.toBeVisible();
 await expect.poll(()=>calls.length).toBeGreaterThan(0);
 const changes=calls.flatMap(call=>call.p_changes);
 expect(changes).toHaveLength(1);expect(changes[0].collection).toBe('management');expect(changes[0].id).toBe('AMC-EDIT');
 expect(changes[0].data.row.period_end).toBe('2027-01-31');
 expect(changes[0].data.row.management_amount).toBe(2500);
 expect(changes[0].data.row.status).toBe('PAUSED');
 expect(changes[0].data.row.created_at).toBe(created);
});

test('moving a lead to projects assigns only its manager and the manager can change later',async({page})=>{
 const {tables}=require('./fixtures.cjs');const {calls}=await mockWorkspace(page);
 await page.route('**/rest/v1/leads?*',route=>route.fulfill({json:tables.leads.map(lead=>({...lead,id:'10000000-0000-0000-0000-000000000099',external_id:'NEW-PROJECT-LEAD'}))}));
 await page.goto('/requests/NEW-PROJECT-LEAD');
 const form=page.locator('.project-create-form');
 await expect(form.locator('select[name="leadDesigner"]')).toHaveCount(0);
 await expect(form.getByText(/Allocation/)).toHaveCount(0);
 await form.locator('input[name="projectTitle"]').fill('Manager only project');
 await form.locator('input[name="startDate"]').fill('2026-11-04');
 await form.locator('input[name="contractedValue"]').fill('2400');
 await form.locator('select[name="projectManager"]').selectOption('00000000-0000-0000-0000-000000000001');
 await form.getByRole('button',{name:'Move to Projects',exact:true}).click();
 await expect(page).toHaveURL(/\/projects\//);
 const manager=page.getByRole('combobox',{name:'Assigned project manager',exact:true});
 await expect(manager).toHaveValue('00000000-0000-0000-0000-000000000001');
 const created=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='projects');
 expect(created.data.team).toHaveLength(1);
 expect(created.data.team[0].role).toBe('Project Manager');
 expect(created.data.team[0].user_id).toBe('00000000-0000-0000-0000-000000000001');
 await manager.selectOption('00000000-0000-0000-0000-000000000002');
 await expect(manager).toHaveValue('00000000-0000-0000-0000-000000000002');
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='projects').at(-1)?.data.team[0]?.user_id).toBe('00000000-0000-0000-0000-000000000002');
 await expect(page.locator('.project-detail-side')).not.toContainText(/Allocation|%/);
});


test('invoice is generated as draft and sent to the client on request',async({page})=>{
 await page.route('**/api/invoices/*/pdf',route=>route.fulfill({contentType:'application/pdf',body:'%PDF-1.4 saved'}));
 const {calls}=await mockWorkspace(page);
 await page.goto('/invoices');
 await page.getByRole('button',{name:'Generate invoice',exact:true}).click();
 await page.getByRole('tab',{name:'Direct / custom invoice'}).click();
 const form=page.locator('form.invoice-modal-form').filter({has:page.locator('input[name="billTo"]')});
 await form.locator('input[name="billTo"]').fill('Northstar Studio');
 await form.locator('input[name="clientName"]').fill('Sam Taylor');
 await form.locator('input[name="clientEmail"]').fill('sam@example.com');
 await form.locator('input[name="description"]').fill('Website delivery');
 await form.locator('input[name="amount"]').fill('1200');
 await form.getByRole('button',{name:'Generate & Save to Database'}).click();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).some(change=>change.collection==='invoices')).toBe(true);
 const invoice=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='invoices').data.row;
 expect(invoice.status).toBe('GENERATED');
 await page.getByRole('button',{name:'Send to client',exact:true}).last().click();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='invoices').at(-1)?.data.row.status).toBe('SENT');
 expect(calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='invoices').at(-1).data.row.sent_at).toBeTruthy();
});

test('paid client invoice loads the saved admin PDF without generating another invoice',async({page})=>{
 const {calls}=await mockWorkspace(page,{role:'client'});
 const pdf=Buffer.from('%PDF-1.4\nExact saved admin invoice bytes');let reads=0;
 await page.route('**/api/client/records',route=>route.fulfill({json:{proposals:[],documents:[],invoices:[{id:'own-invoice',number:'SER-INV-2026-001',status:'CONFIRMED_PAID',total:1200,currency:'USD'}]}}));
 await page.route('**/api/invoices/SER-INV-2026-001/pdf',route=>{reads++;return route.fulfill({contentType:'application/pdf',body:pdf});});
 await page.goto('/client/invoices/own-invoice');
 await expect(page.getByRole('link',{name:'Download saved invoice PDF'})).toBeVisible();
 await expect(page.getByTitle('Saved admin invoice PDF')).toBeVisible();
 const href=await page.getByRole('link',{name:'Download saved invoice PDF'}).getAttribute('href');
 const bytes=await page.evaluate(async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),href);
 expect(Buffer.from(bytes)).toEqual(pdf);expect(reads).toBeGreaterThanOrEqual(1);expect(calls).toHaveLength(0);
 await expect(page.locator('.invoice-print-area')).toHaveCount(0);
 await page.goto('/client/invoices/another-invoice');
 await expect(page.getByText('This invoice is not available for your account.')).toBeVisible();
});

test('admin saves an actual PDF from the invoice template',async({page})=>{
 await mockWorkspace(page);let saved;
 await page.route('**/api/invoices/*/pdf',route=>{
  if(route.request().method()==='GET')return route.fulfill({status:404,json:{error:'Not saved'}});
  saved=route.request().postDataBuffer();return route.fulfill({json:{saved:true}});
 });
 await page.goto('/invoices?invoice=EVE-INV-2026-001');
 await page.getByRole('button',{name:'Download saved PDF',exact:true}).click();
 await expect.poll(()=>saved?.subarray(0,5).toString(),{timeout:20000}).toBe('%PDF-');
 expect(saved.length).toBeGreaterThan(5000);
});


test('employees automatically return to their dashboard from restricted pages',async({page})=>{
 await mockWorkspace(page,{role:'employee'});
 await page.goto('/invoices');
 await expect(page).toHaveURL('/');
 await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
 await expect(page.getByText('This area is not part of your workspace.')).toHaveCount(0);
 await page.goto('/proposal/12345678-1234-1234-1234-123456789012');
 await expect(page).toHaveURL('/');
});
