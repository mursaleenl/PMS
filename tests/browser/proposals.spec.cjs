const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
const validUntil=new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10);

async function fillProposal(page) {
 await page.goto('/proposals?lead=LEAD-TEST-001');
 const form=page.getByRole('form',{name:'Basic proposal generator'});
 await form.getByLabel('Proposal title').fill('Northstar website proposal');
 await form.getByLabel('Scope of work').fill('Website strategy and page structure\nResponsive design and development\nLaunch and handover');
 await form.getByLabel('Deliverables').fill('Five-page responsive website\nContact enquiry form\nContent management guide');
 await form.getByLabel('Proposal amount').fill('4500');
 await form.getByLabel('Deposit (%)').fill('30');
 await form.getByLabel('Timeline',{exact:true}).fill('4 weeks from approval and receipt of content');
 await form.getByLabel('Payment terms').fill('30% deposit to begin. Remaining 70% due before launch.');
 await form.locator('input[name="expiryDate"]').fill(validUntil);
 return form;
}

test('basic proposal generates a saved client view, PDF, and revision history',async({page,context})=>{
 const {calls}=await mockWorkspace(page);
 const {tables}=require('./fixtures.cjs');
 await page.route('**/rest/v1/leads?*',route=>route.fulfill({json:tables.leads.map(lead=>({...lead,status:'NEW'}))}));
 const form=await fillProposal(page);
 await form.getByRole('button',{name:'Generate proposal',exact:true}).click();
 const view=page.getByRole('link',{name:'View / save PDF'});
 await expect(view).toBeVisible();
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.getByRole('button',{name:'Copy proposal link',exact:true}).click();
 await expect(page.getByRole('button',{name:'Link copied',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain(await view.getAttribute('href'));
 const change=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='leads');
 expect(change.data.row.status).toBe('PROPOSAL_SENT');
 const row=change.data.proposals[0].row;
 expect(row.quoted_amount).toBe(4500);expect(row.deposit_percent).toBe(30);expect(row.status).toBe('SENT');
 const proposal=Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
 const client=await context.newPage();
 await client.route(`**/api/proposals/${row.share_token}`,route=>route.fulfill({json:{lead:{fullName:'Sam Taylor',companyName:'Northstar Studio',proposals:[proposal]}}}));
 await client.goto(await view.getAttribute('href'));
 await expect(client.getByRole('heading',{name:'Northstar website proposal',exact:true})).toBeVisible();
 await expect(client.getByText('$4,500.00',{exact:true})).toBeVisible();
 await expect(client.getByText('Five-page responsive website',{exact:true})).toBeVisible();
 await expect(client.getByRole('navigation',{name:'Table of contents'})).toHaveCount(0);
 await client.evaluate(()=>{window.print=()=>{window.__printed=true;};});
 await client.getByRole('button',{name:'Save A4 PDF'}).click();
 expect(await client.evaluate(()=>window.__printed)).toBe(true);
 if(process.env.PMS_PROPOSAL_PREVIEW_DIR){
  const fs=require('node:fs'),dir=process.env.PMS_PROPOSAL_PREVIEW_DIR;
  fs.mkdirSync(dir,{recursive:true});
  await client.addStyleTag({content:'nextjs-portal { display: none; }'});
  await client.screenshot({path:`${dir}/proposal-preview.png`,fullPage:true});
  await client.pdf({path:`${dir}/proposal-preview.pdf`,format:'A4',printBackground:true});
 }
 await client.setViewportSize({width:390,height:844});
 expect(await client.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Create revised proposal'}).click();
 await form.getByLabel('Proposal amount').fill('5000');
 await form.getByRole('button',{name:'Generate proposal',exact:true}).click();
 await expect(form).not.toBeVisible();
 const revisions=calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='leads').at(-1).data.proposals;
 expect(revisions.map(item=>item.row.status)).toEqual(['SUPERSEDED','SENT']);
 expect(revisions[1].row.version).toBe(2);expect(revisions[1].row.share_token).not.toBe(row.share_token);
});

test('proposal save failure retries the same version and only reveals the link after saving',async({page})=>{
 await mockWorkspace(page);const requests=[];
 await page.route('**/rest/v1/rpc/save_workspace_changes',route=>{
  const body=route.request().postDataJSON();requests.push(body);
  if(requests.length===1)return route.fulfill({status:503,json:{message:'Temporary proposal save failure'}});
  return route.fulfill({json:Object.fromEntries(body.p_changes.map(change=>[`${change.collection}:${change.id}`,1]))});
 });
 const form=await fillProposal(page);
 await form.getByRole('button',{name:'Generate proposal',exact:true}).click();
 await expect(page.locator('.basic-proposal-generator [role="alert"]')).toContainText('Temporary proposal save failure');
 await expect(page.getByRole('link',{name:'View / save PDF'})).not.toBeVisible();
 await form.getByRole('button',{name:'Retry saving proposal'}).click();
 await expect(page.getByRole('link',{name:'View / save PDF'})).toBeVisible();
 expect(requests).toHaveLength(2);expect(requests[0].p_request_id).toBe(requests[1].p_request_id);
 expect(requests[0].p_changes).toEqual(requests[1].p_changes);
});

test('proposal rejects past expiry and blank scope without saving',async({page})=>{
 const {calls}=await mockWorkspace(page);const form=await fillProposal(page);
 await form.locator('input[name="expiryDate"]').fill('2000-01-01');
 await form.getByRole('button',{name:'Generate proposal',exact:true}).click();
 await expect(page.locator('.basic-proposal-generator [role="alert"]')).toContainText('expiry date today or later');
 await form.locator('input[name="expiryDate"]').fill(validUntil);
 await form.getByLabel('Scope of work').fill('   ');
 await form.getByRole('button',{name:'Generate proposal',exact:true}).click();
 await expect(page.locator('.basic-proposal-generator [role="alert"]')).toContainText('Enter a title, scope');
 expect(calls).toHaveLength(0);
});

test('custom proposal saves recipient details and retries without creating a second record',async({page})=>{
 await mockWorkspace(page);const requests=[];
 await page.route('**/rest/v1/rpc/save_workspace_changes',route=>{
  const body=route.request().postDataJSON();requests.push(body);
  if(requests.length===1)return route.fulfill({status:503,json:{message:'Temporary custom proposal failure'}});
  return route.fulfill({json:Object.fromEntries(body.p_changes.map(change=>[`${change.collection}:${change.id}`,0]))});
 });
 await page.goto('/proposals');
 await page.getByRole('button',{name:'Generate proposal',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Proposal & SOW',exact:true});
 await dialog.getByRole('tab',{name:'Direct / custom proposal'}).click();
 const form=dialog.getByRole('form',{name:'Basic proposal generator'});
 await form.getByLabel('Contact name',{exact:true}).fill('Custom Contact');
 await form.getByLabel('Contact email',{exact:true}).fill('contact@custom.example');
 await form.getByLabel('Company / organization',{exact:true}).fill('Custom Organization');
 await form.getByLabel('Operating company',{exact:true}).selectOption('Servn');
 await form.getByLabel('Proposal title').fill('Custom CRM proposal');
 await form.getByLabel('Scope of work').fill('Build a custom CRM and reporting workflow.');
 await form.getByLabel('Deliverables').fill('CRM, dashboard and training');
 await form.getByLabel('Proposal amount').fill('6500');
 await form.getByLabel('Payment terms').fill('Payment due within 14 days.');
 await form.locator('input[name="expiryDate"]').fill(validUntil);
 await form.getByRole('button',{name:'Generate proposal',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Temporary custom proposal failure');
 await expect(dialog.getByRole('link',{name:'View / save PDF'})).toHaveCount(0);
 await form.getByRole('button',{name:'Retry saving proposal'}).click();
 await expect(dialog.getByRole('link',{name:'View / save PDF'})).toBeVisible();
 expect(requests).toHaveLength(2);
 expect(requests[1].p_request_id).toBe(requests[0].p_request_id);
 expect(requests[1].p_changes).toEqual(requests[0].p_changes);
 const saved=requests[0].p_changes;
 expect(saved).toHaveLength(1);expect(saved[0].collection).toBe('leads');
 expect(saved[0].data.row.full_name).toBe('Custom Contact');
 expect(saved[0].data.row.company_name).toBe('Custom Organization');
 expect(saved[0].data.row.operating_company).toBe('Servn');
 expect(saved[0].data.proposals[0].row.quoted_amount).toBe(6500);
 await dialog.getByRole('button',{name:'Close proposal editor'}).click();
 await expect(page.locator('.proposal-index-list')).toContainText('Custom CRM proposal');
 await page.getByRole('button',{name:'Manage proposal',exact:true}).click();
 await expect(page.getByRole('link',{name:'View / save PDF'})).toBeVisible();
});

test('SOW is saved from Proposals and updates the linked project document',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.goto('/proposals?lead=LEAD-TEST-001');
 const form=page.getByRole('form',{name:'Signed SOW document',exact:true});
 await form.locator('input[type="file"]').setInputFiles({name:'signed-sow.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 test signed SOW')});
 await form.getByRole('button',{name:'Save signed SOW'}).click();
 await expect(page.getByRole('link',{name:'Download signed SOW',exact:true})).toBeVisible();
 await expect.poll(()=>calls.length).toBeGreaterThan(0);
 const changes=calls.flatMap(call=>call.p_changes);
 expect(changes.find(change=>change.collection==='leads').data.row.acceptance_document_name).toBe('signed-sow.pdf');
 expect(changes.find(change=>change.collection==='projects').data.row.signed_contract_name).toBe('signed-sow.pdf');
 await page.getByRole('button',{name:'Close proposal editor'}).click();
 await page.goto('/requests/LEAD-TEST-001');
 await expect(page.getByRole('form',{name:'Signed SOW document'})).toHaveCount(0);
 await expect(page.locator('#workflow-proposal')).toHaveCount(0);
});
