const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
for(const width of [320,390,768]){
 test(`core pages fit a ${width}px viewport`,async({page})=>{
  await page.setViewportSize({width,height:844});await mockWorkspace(page);
  for(const path of ['/','/projects','/work','/requests','/invoices','/clients','/post-sale','/users','/settings','/work/attendance','/work/performance']){
   await page.goto(path);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),path).toBeLessThanOrEqual(1);
   if(width<=700){
    await expect(page.locator('.sidebar')).not.toBeVisible();
    const account=await page.getByRole('button',{name:'User account menu'}).boundingBox();expect(account.x+account.width,path).toBeLessThanOrEqual(width);
   }
  }
 });
}
