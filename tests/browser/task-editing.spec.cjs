const {test,expect}=require('@playwright/test');
const {mockWorkspace,tables}=require('./fixtures.cjs');

test('edit task saves details, multiple assignees and deadline, retains progress, and reloads saved values',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.goto('/work');const row=page.locator('tr').filter({hasText:'Review navigation and content structure'});
 await row.getByLabel('Actions for Review navigation and content structure',{exact:true}).click();await row.getByRole('button',{name:'Edit task',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Edit task',exact:true});await expect(dialog.getByRole('button',{name:'Close task form',exact:true})).toBeVisible();
 await dialog.getByRole('textbox',{name:'Task title',exact:true}).fill('Review the booking journey');await dialog.getByRole('textbox',{name:'Description',exact:true}).fill('Confirm the complete customer journey.');
 await dialog.getByRole('group',{name:'Assignees',exact:true}).getByRole('checkbox',{name:'Jordan Lee',exact:true}).check();
 await dialog.getByRole('combobox',{name:'Priority',exact:true}).selectOption('P2');await dialog.getByRole('spinbutton',{name:'Estimated hours',exact:true}).fill('4');
 await dialog.getByRole('textbox',{name:'Deadline',exact:true}).fill('2026-12-20T16:45');
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);}
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).some(change=>change.data.workItems?.some(task=>task.title==='Review the booking journey'))).toBe(true);
 const change=calls.flatMap(call=>call.p_changes).find(change=>change.data.workItems?.some(task=>task.title==='Review the booking journey'));
 const saved=change.data.workItems.find(task=>task.title==='Review the booking journey'),original=tables.project_work_items.find(task=>task.external_id===saved.external_id);
 expect(saved.assignees.map(person=>person.name).sort()).toEqual(['Alex Morgan','Jordan Lee']);expect(saved.priority).toBe('P2');expect(saved.estimated_hours).toBe(4);expect(saved.description).toBe('Confirm the complete customer journey.');expect(saved.status).toBe(original.status);expect(saved.logged_hours).toBe(original.logged_hours);
 expect(saved.deadline).toMatch(/T.*Z$/);
 await page.route('**/rest/v1/project_work_items?*',route=>route.fulfill({json:tables.project_work_items.map(task=>task.external_id===saved.external_id?{...task,...saved}:task)}));
 await page.reload();const updated=page.locator('tr').filter({hasText:'Review the booking journey'});await expect(updated.locator('.task-deadline')).toContainText('Dec 20');
 await updated.getByLabel('Actions for Review the booking journey',{exact:true}).click();await updated.getByRole('button',{name:'Edit task',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit task',exact:true});
 await expect(dialog.getByRole('textbox',{name:'Deadline',exact:true})).toHaveValue('2026-12-20T16:45');
 await dialog.getByRole('button',{name:'Clear date',exact:true}).click();await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(updated.locator('.task-deadline')).toHaveCount(0);
 await page.getByRole('button',{name:'Board',exact:true}).click();const card=page.locator('.task-kanban-card').filter({hasText:'Review the booking journey'});await card.getByRole('button',{name:'Edit task',exact:true}).click();await expect(page.getByRole('dialog',{name:'Edit task',exact:true})).toBeVisible();
});

test('project tasks support editing, while employees keep progress controls without edit actions',async({page})=>{
 await mockWorkspace(page);await page.goto('/projects/EVE-2026-001');await page.locator('.project-task-summary-item').filter({hasText:'Build the homepage experience'}).getByRole('button',{name:'Edit task',exact:true}).click();await expect(page.getByRole('dialog',{name:'Edit task',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close task form',exact:true}).click();
 await mockWorkspace(page,{role:'employee'});await page.goto('/work');await expect(page.getByRole('button',{name:'Assign task',exact:true})).toHaveCount(0);const row=page.locator('tr').filter({hasText:'Review navigation and content structure'});await row.getByLabel('Actions for Review navigation and content structure',{exact:true}).click();await expect(page.getByRole('button',{name:'Edit task',exact:true})).toHaveCount(0);await expect(row.getByRole('checkbox')).toBeVisible();
});
