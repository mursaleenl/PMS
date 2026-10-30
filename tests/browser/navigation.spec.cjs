const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('global navigation keeps the EVECTURE logo and supports collapse and route selection',async({page})=>{
 await mockWorkspace(page);await page.goto('/');
 await expect(page.locator('.workspace-logo')).toBeVisible();
 await expect(page.getByRole('heading',{level:1}).first()).toHaveCSS('text-transform','uppercase');
 await expect(page.locator('.workspace-logo')).toHaveAttribute('src','/evecture-logo.png');
 await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
 const before=await page.locator('.main-area').boundingBox();
 await page.locator('.sidebar').hover();
 await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-collapsed/);
 await expect.poll(()=>page.locator('.sidebar').evaluate(element=>element.getBoundingClientRect().width)).toBeGreaterThan(200);
 const after=await page.locator('.main-area').boundingBox();
 expect(after.x).toBe(before.x);expect(after.width).toBe(before.width);
 const header=await page.locator('.workspace-topbar').boundingBox(),sidebar=await page.locator('.sidebar').boundingBox();
 expect(sidebar.y).toBeGreaterThanOrEqual(header.y+header.height+8);
 await page.locator('h1').hover();
 await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
 await expect(page.locator('.workspace-nav-toggle')).toHaveCount(0);
 await page.locator('.sidebar').hover();
 await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-collapsed/);
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
 await expect(page.locator('.workspace-logo')).toBeVisible();
 const account=await page.getByRole('button',{name:'User account menu'}).boundingBox();
 expect(account.x+account.width).toBeLessThanOrEqual(390-8);
 await expect(page.locator('.sidebar')).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Open navigation',exact:true})).toHaveCount(0);
 await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Tasks',exact:true}).click();await expect(page).toHaveURL(/\/work$/);
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
for(const [role,color] of [['admin','rgb(248, 113, 113)'],['employee','rgb(121, 173, 255)'],['client','rgb(255, 255, 255)']]){
 test(`${role} has the requested role colour`,async({page})=>{
  await mockWorkspace(page,{role});
  if(role==='client')await page.route('**/api/client/workspace',route=>route.fulfill({json:{projects:[],proposals:[]}}));
  await page.goto(role==='client'?'/client':'/');
  const badge=page.locator('.topbar-user-role-badge');await expect(badge).toBeVisible();await expect(badge).toHaveCSS('color',color);
 });
}

test('mobile island scrolls in both directions and can be compacted',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockWorkspace(page);await page.goto('/');
 const island=page.getByRole('navigation',{name:'Mobile navigation',exact:true});
 await expect(island).toBeInViewport();
 const scroller=page.locator('.island-links');
 expect(await scroller.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(true);
 await expect(island.locator('.island-label').first()).not.toBeVisible();
 expect(await scroller.evaluate(element=>{const bounds=element.getBoundingClientRect();return [...element.children].filter(link=>{const rect=link.getBoundingClientRect();return rect.left>=bounds.left-1&&rect.right<=bounds.right+1;}).length;})).toBe(4);

 await scroller.evaluate(element=>element.scrollTo({left:element.clientWidth,behavior:'instant'}));
 await expect.poll(()=>scroller.evaluate(element=>element.scrollLeft)).toBeGreaterThan(50);
 await scroller.evaluate(element=>element.scrollTo({left:0,behavior:'instant'}));
 await island.getByRole('link',{name:'Projects',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);
 await page.getByRole('button',{name:'Collapse bottom navigation',exact:true}).click();
 await expect(island).toHaveClass(/island-compact/);
 await page.getByRole('button',{name:'Expand bottom navigation',exact:true}).click();
 await expect(island).not.toHaveClass(/island-compact/);
});

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
 test(`notifications stay inside ${viewport.width}x${viewport.height} and remain usable`,async({page})=>{
  await page.setViewportSize(viewport);await mockWorkspace(page);await page.goto('/');
  await page.getByRole('button',{name:'Notifications',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'Workspace notifications'});await expect(panel).toBeVisible();
  const box=await panel.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
  expect(await panel.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
  await panel.getByRole('button',{name:/Unread \(/}).click();
  await panel.getByRole('button',{name:'Mark all notifications as read'}).click();
  await expect(panel.getByText('You have no unread notifications.')).toBeVisible();
  await panel.getByRole('button',{name:'Close notifications'}).click();await expect(panel).not.toBeVisible();
  await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.keyboard.press('Escape');await expect(panel).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Notifications',exact:true})).toBeFocused();
 });
}
