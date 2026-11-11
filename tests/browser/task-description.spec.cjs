const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('dispatch saves the description and makes it readable on the Tasks board',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/projects/EVE-2026-001');
 await page.getByRole('button',{name:'Dispatch task',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Dispatch task',exact:true});
 await expect(dialog.getByText('Action type',{exact:true})).toHaveCount(0);
 await dialog.getByRole('textbox',{name:'Deadline',exact:true}).fill('2026-12-15T17:30');
 await dialog.getByRole('textbox',{name:'Task title',exact:true}).fill('Build the booking flow');
 const description='Add date selection and availability.\nShow a confirmation after booking.';
 await dialog.getByRole('textbox',{name:'Description',exact:true}).fill(description);
 await dialog.getByRole('group',{name:'Assignees',exact:true}).getByRole('checkbox',{name:'Jordan Lee',exact:true}).check();
 await dialog.getByRole('button',{name:'Dispatch to tasks',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).some(change=>change.collection==='projects'&&change.data.workItems.some(task=>task.title==='Build the booking flow'&&task.description===description&&Boolean(task.deadline)))).toBe(true);
 await page.getByRole('link',{name:'Tasks',exact:true}).first().click();
 const task=page.locator('tr').filter({hasText:'Build the booking flow'});await expect(task).toBeVisible();
 await expect(task.locator('.task-deadline')).toContainText('Dec 15');
 await task.locator('.task-description summary').click();await expect(task.locator('.task-description p')).toHaveText(description);
});
