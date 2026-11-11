const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
for(const role of ['admin','project_manager'])test(`${role} deletes only from project details after confirmation`,async({page})=>{
 const {calls}=await mockWorkspace(page,{role});await page.goto('/projects');
 await expect(page.locator('.portfolio-card')).toHaveCount(2);
 await expect(page.locator('.portfolio-card').getByRole('button',{name:/Delete/})).toHaveCount(0);
 await page.goto('/projects/EVE-2026-001');
 const remove=page.getByRole('button',{name:'Delete project',exact:true});await expect(remove).toBeVisible();
 page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toContain('Northstar website redesign');await dialog.dismiss();});
 await remove.click();await expect(page.getByRole('heading',{name:'Northstar website redesign',exact:true})).toBeVisible();expect(calls).toHaveLength(0);
 page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');await dialog.accept();});
 await remove.click();await expect(page).toHaveURL(/\/projects$/);
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).some(change=>change.collection==='projects'&&change.id==='EVE-2026-001'&&change.operation==='delete')).toBe(true);
});
