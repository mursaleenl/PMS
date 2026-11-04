const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('global navigation supports collapse and route selection',async({page})=>{
 await mockWorkspace(page);await page.goto('/');
 await expect(page.locator('.workspace-topbar')).toBeVisible();
 await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-expanded/);
 const before=await page.locator('.main-area').boundingBox();
 await page.locator('.sidebar').hover();
 await expect(page.locator('.app-shell')).toHaveClass(/sidebar-expanded/);
 await expect.poll(()=>page.locator('.sidebar').evaluate(element=>element.getBoundingClientRect().width)).toBeGreaterThan(200);
 const after=await page.locator('.main-area').boundingBox();
 expect(after.x).toBe(before.x);expect(after.width).toBe(before.width);
 await expect(page.locator('.sidebar')).toBeInViewport();
 await page.mouse.move(1000,500);
 await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-expanded/);
 await expect(page.locator('.workspace-nav-toggle')).toHaveCount(0);
 await page.locator('.sidebar').hover();
 await expect(page.locator('.app-shell')).toHaveClass(/sidebar-expanded/);
 await page.locator('.sidebar').getByRole('link',{name:'Projects',exact:true}).click();
 await expect(page).toHaveURL(/\/projects$/);
 await expect(page.locator('.sidebar').getByRole('link',{name:'Projects',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('heading',{name:'Project workspaces',exact:true})).toBeVisible();
});
test('global search and account controls remain functional',async({page})=>{
 await mockWorkspace(page);await page.goto('/');
 await page.getByRole('button',{name:'Search workspace',exact:true}).click();
 const search=page.getByRole('dialog',{name:'Search workspace'});await expect(search).toBeVisible();
 await search.getByRole('textbox').fill('Northstar');await expect(search.getByRole('link').first()).toBeVisible();
 await page.keyboard.press('Escape');await expect(search).not.toBeVisible();
 await page.getByRole('button',{name:'User account menu'}).click();await expect(page.getByRole('menu')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('menu')).not.toBeVisible();
});
test('mobile navigation opens, closes, and does not overflow the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockWorkspace(page);await page.goto('/');
 await expect(page.locator('.workspace-topbar')).toBeVisible();
 const account=await page.getByRole('button',{name:'User account menu'}).boundingBox();
 expect(account.x+account.width).toBeLessThanOrEqual(390-8);
 await expect(page.locator('.sidebar')).not.toBeVisible();
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Workspace navigation'})).toBeVisible();
 await page.locator('.sidebar').getByRole('link',{name:'Tasks',exact:true}).click();await expect(page).toHaveURL(/\/work$/);
 await expect(page.locator('.sidebar')).not.toBeVisible();
 for(const path of ['/','/projects','/invoices','/requests','/clients']){
  await page.goto(path);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),`Page overflow: ${path}`).toBeLessThanOrEqual(1);
 }
});
test('no preview label or banner is displayed when the database needs upgrading',async({page})=>{
 await mockWorkspace(page,{preview:true});await page.goto('/');await expect(page.locator('.sidebar')).toBeVisible();
 await expect(page.getByText(/preview/i)).toHaveCount(0);
 await expect(page.locator('.workspace-save-status')).toHaveCount(0);
});
for(const role of ['admin','employee','client']){
 test(`${role} retains desktop account controls`,async({page})=>{
  await mockWorkspace(page,{role});
  if(role==='client')await page.route('**/api/client/workspace',route=>route.fulfill({json:{projects:[],proposals:[]}}));
  await page.goto(role==='client'?'/client':'/');
  const topbar=page.locator('#workspace-topbar');
  await expect(topbar).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(topbar.locator('.topbar-user-name')).toBeVisible();
  await expect(topbar.locator('.global-search-trigger > span')).toBeVisible();
  await expect(topbar.locator('.mobile-topbar-title')).toHaveCount(0);
  const account=topbar.getByRole('button',{name:'User account menu'});
  await expect(account).toHaveAttribute('aria-expanded','false');
  await account.click();
  await expect(account).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menu').locator('.topbar-account-role')).toHaveText(new RegExp(role,'i'));
 });
}

test('mobile sidebar expands and closes with Escape or outside tap',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockWorkspace(page);await page.goto('/');
 const toggle=page.getByRole('button',{name:'Open navigation',exact:true});
 await toggle.click();
 const sidebar=page.getByRole('dialog',{name:'Workspace navigation'});
 await expect(sidebar).toBeVisible();
 await expect(sidebar.getByRole('link',{name:'Projects',exact:true})).toBeVisible();
 await expect(sidebar).toHaveCSS('background-color','rgb(17, 24, 39)');
 const alignment=await sidebar.evaluate(el=>({logo:el.querySelector('.workspace-sidebar-brand img').getBoundingClientRect().left,icon:el.querySelector('.primary-nav .nav-icon').getBoundingClientRect().left,brand:el.querySelector('.workspace-sidebar-brand span').getBoundingClientRect().left,label:el.querySelector('.primary-nav .nav-link-label').getBoundingClientRect().left}));
 expect(Math.abs(alignment.logo-alignment.icon)).toBeLessThanOrEqual(2);
 expect(Math.abs(alignment.brand-alignment.label)).toBeLessThanOrEqual(1);
 await expect(sidebar.locator('.nav-link.active')).toHaveCSS('background-color','rgb(37, 99, 235)');
 await expect(page.locator('#workspace-topbar')).toHaveCSS('height','48px');
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
 await page.keyboard.press('Escape');await expect(sidebar).not.toBeVisible();
 await expect(toggle).toBeFocused();
 await toggle.click();await page.getByRole('button',{name:'Dismiss navigation',exact:true}).click({position:{x:375,y:400}});
 await expect(sidebar).not.toBeVisible();
 await expect(page.locator('.mobile-navigation-island')).toHaveCount(0);
});

for(const viewport of [{width:320,height:568},{width:390,height:844}]){
 test(`search and account stay separate on the right at ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await mockWorkspace(page);await page.goto('/');
  const search=page.getByRole('button',{name:'Search workspace',exact:true});
  const account=page.getByRole('button',{name:'User account menu'});
  const searchBox=await search.boundingBox(),accountBox=await account.boundingBox();
  expect(searchBox.x).toBeGreaterThan(viewport.width/2);
  expect(searchBox.x+searchBox.width).toBeLessThanOrEqual(accountBox.x);
  expect(accountBox.x+accountBox.width).toBeLessThanOrEqual(viewport.width-8);
  await expect(page.locator('.workspace-contextbar,.workspace-save-status')).toHaveCount(0);
  await account.click();await expect(page.getByRole('menu')).toBeVisible();
  await search.click();await expect(page.getByRole('menu')).toHaveCount(0);
  const dialog=page.getByRole('dialog',{name:'Search workspace'});await expect(dialog).toBeVisible();
  const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 });
}

test('mobile sidebar traps focus and retains current-page selection',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await mockWorkspace(page);await page.goto('/projects');
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 const sidebar=page.getByRole('dialog',{name:'Workspace navigation'});
 await expect(sidebar.getByRole('link',{name:'Projects',exact:true})).toHaveAttribute('aria-current','page');
 await sidebar.getByRole('button',{name:'Close navigation',exact:true}).focus();await page.keyboard.press('Shift+Tab');
 await expect(sidebar.getByRole('link',{name:'Account settings',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(sidebar.getByRole('button',{name:'Close navigation',exact:true})).toBeFocused();
 await page.screenshot({path:testInfo.outputPath('mobile-sidebar.png')});
 await page.keyboard.press('Escape');
 await page.screenshot({path:testInfo.outputPath('mobile-projects.png')});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await expect(sidebar).toHaveCSS('transition-duration','0s');
 const target=await sidebar.getByRole('link',{name:'Projects',exact:true}).boundingBox();expect(target.height).toBeGreaterThanOrEqual(44);
});
