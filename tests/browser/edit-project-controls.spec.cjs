const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('edit project offers currencies and fast month/year selection without leaving the popup',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/projects/EVE-2026-001');
 await page.getByRole('button',{name:'Edit project',exact:true}).click();const form=page.getByRole('dialog',{name:'Edit project details',exact:true});
 await expect(form.getByRole('button',{name:'Close edit details',exact:true})).toBeVisible();
 await expect(form.getByRole('combobox',{name:'Currency',exact:true}).locator('option')).toHaveText(['USD','INR','EUR','GBP','AED','AUD','CAD']);
 await form.getByLabel('Target date',{exact:true}).press('ArrowDown');const calendar=page.getByRole('dialog',{name:'Choose a date',exact:true});
 await calendar.getByRole('button',{name:'Choose year',exact:true}).click();await calendar.getByRole('spinbutton',{name:'Go to year',exact:true}).fill('2028');await calendar.getByRole('button',{name:'Go',exact:true}).click();
 await calendar.getByRole('button',{name:'February',exact:true}).click();await calendar.locator('[data-date="2028-02-29"]').click();
 await expect(form.getByLabel('Target date',{exact:true})).toHaveValue('2028-02-29');await expect(form).toBeVisible();
 await form.getByRole('combobox',{name:'Currency',exact:true}).selectOption('AED');await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).not.toBeVisible();
 const saved=calls.flatMap(call=>call.p_changes).find(change=>change.collection==='projects').data.row;expect(saved.target_date).toBe('2028-02-29');expect(saved.currency).toBe('AED');
});

test('calendar stays within the viewport and Escape dismisses it before the edit form',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/projects/EVE-2026-001');await page.getByRole('button',{name:'Edit project',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Edit project details',exact:true});
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:900});await form.getByLabel('Start date',{exact:true}).press('ArrowDown');
  const calendar=page.getByRole('dialog',{name:'Choose a date',exact:true});await expect(calendar).toBeVisible();
  await expect.poll(async()=>{const box=await calendar.boundingBox();return box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=900;}).toBe(true);
  if(width===390)await form.screenshot({path:'/private/tmp/pms-edit-project-popup.png',animations:'disabled'});
  await page.keyboard.press('Escape');await expect(calendar).not.toBeVisible();await expect(form).toBeVisible();
 }
 await form.getByRole('button',{name:'Close edit details',exact:true}).click();await expect(form).not.toBeVisible();expect(calls).toHaveLength(0);
});
