const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
for(const width of [320,390,768]){
 test(`core pages fit a ${width}px viewport`,async({page})=>{
  await page.setViewportSize({width,height:844});await mockWorkspace(page);
  for(const path of ['/','/projects','/proposals','/requests/new','/work','/requests','/invoices','/clients','/post-sale','/users','/settings','/work/attendance','/reviews']){
   await page.goto(path);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),path).toBeLessThanOrEqual(1);
   await expect(page.locator('#workspace-topbar')).toHaveCSS('background-color','rgb(255, 255, 255)');
   await expect(page.locator('.workspace-save-status,.workspace-contextbar,.mobile-topbar-title')).toHaveCount(0);
   const gap=await page.evaluate(()=>document.querySelector('h1').getBoundingClientRect().top-document.querySelector('#workspace-topbar').getBoundingClientRect().bottom);
   expect(gap,path).toBeGreaterThanOrEqual(0);
   if(width<=700)expect(gap,path).toBeLessThanOrEqual(60);
   if(width<=700){
    await expect(page.locator('.sidebar')).not.toBeVisible();
    const account=await page.getByRole('button',{name:'User account menu'}).boundingBox();expect(account.x+account.width,path).toBeLessThanOrEqual(width);
   }
  }
 });
}

test('expanded mobile lead forms fit without a floating navigation dock',async({page})=>{
 const {tables}=require('./fixtures.cjs');
 await page.setViewportSize({width:320,height:844});await mockWorkspace(page);
 await page.route('**/rest/v1/leads?*',route=>route.fulfill({json:tables.leads.map(lead=>({...lead,status:'NEW'}))}));
 await page.goto('/requests');await page.locator('.lead-record-summary').first().click();
 await page.getByRole('combobox',{name:'Choose operating company',exact:true}).focus();
 await expect(page.getByRole('button',{name:'Log first contact',exact:true})).toHaveCount(0);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 if(overflow>1)console.log(await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).map(el=>({name:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).filter(el=>el.right>innerWidth+1).slice(-12)));
 expect(overflow).toBeLessThanOrEqual(1);
 await expect(page.locator('.mobile-navigation-island')).toHaveCount(0);
});

for(const width of [320,390,768,1440]){
 test(`project actions and dispatch do not overlap tabs at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});await mockWorkspace(page);
  await page.goto('/projects/EVE-2026-001');
  const dispatch=page.getByRole('button',{name:'Dispatch task',exact:true});
  const tabs=page.getByRole('navigation',{name:'Project room sections'});
  await expect(dispatch).toBeVisible();
  await expect(tabs.getByRole('button')).toHaveText(['Overview','Staging & Links','Project status','Messages']);
  const dispatchBox=await dispatch.boundingBox(),tabBox=await tabs.boundingBox();
  expect(dispatchBox.y+dispatchBox.height).toBeLessThanOrEqual(tabBox.y);
  const alignment=await page.locator('.project-lifecycle-status .status-badge').first().evaluate(el=>{
   const icon=el.querySelector('svg').getBoundingClientRect(),label=el.querySelector('.status-label').getBoundingClientRect();
   return Math.abs((icon.top+icon.height/2)-(label.top+label.height/2));
  });
  expect(alignment).toBeLessThanOrEqual(1);
  const controls=await page.locator('.project-lifecycle-buttons > .button').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};}));
  for(let i=0;i<controls.length;i++){
   expect(controls[i].left).toBeGreaterThanOrEqual(0);expect(controls[i].right).toBeLessThanOrEqual(width);
   for(let j=i+1;j<controls.length;j++){
    const a=controls[i],b=controls[j];expect(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top).toBe(true);
   }
  }
  if(width<=700)expect(Math.abs(controls[0].height-controls[1].height)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await dispatch.click();await expect(page.getByRole('dialog',{name:'Dispatch task',exact:true})).toBeVisible();
 });
}
