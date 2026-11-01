const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
for(const width of [320,390,768]){
 test(`core pages fit a ${width}px viewport`,async({page})=>{
  await page.setViewportSize({width,height:844});await mockWorkspace(page);
  for(const path of ['/','/projects','/work','/requests','/invoices','/clients','/post-sale','/users','/settings','/work/attendance','/reviews']){
   await page.goto(path);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),path).toBeLessThanOrEqual(1);
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
 await page.getByRole('button',{name:'Log first contact',exact:true}).click();
 const date=page.locator('.first-contact-editor input');await date.focus();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 if(overflow>1)console.log(await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).map(el=>({name:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).filter(el=>el.right>innerWidth+1).slice(-12)));
 expect(overflow).toBeLessThanOrEqual(1);
 await expect(page.locator('.mobile-navigation-island')).toHaveCount(0);
});
