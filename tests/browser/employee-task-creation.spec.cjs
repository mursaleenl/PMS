const {test,expect}=require('@playwright/test');
const {mockWorkspace,tables}=require('./fixtures.cjs');

test('employees create self-assigned tasks only in their assigned projects',async({page})=>{
 const {calls}=await mockWorkspace(page,{role:'employee'});await page.goto('/work');
 await page.getByRole('button',{name:'Create task',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Create task',exact:true});
 const projects=dialog.getByRole('group',{name:'Projects',exact:true});await expect(projects.getByRole('checkbox')).toHaveCount(1);await expect(projects.getByRole('checkbox',{name:'Customer experience platform',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('group',{name:'Assignees',exact:true})).toHaveCount(0);await expect(dialog.getByText('Assigned to you · Alex Morgan',{exact:true})).toBeVisible();
 await projects.getByRole('checkbox',{name:'Northstar website redesign',exact:true}).check();await dialog.getByRole('textbox',{name:'Task title',exact:true}).fill('Check my delivery checklist');await dialog.getByRole('textbox',{name:'Description',exact:true}).fill('Review the responsive layouts.');await dialog.getByRole('textbox',{name:'Deadline',exact:true}).fill('2026-12-10T15:00');await dialog.getByRole('button',{name:'Create task',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).some(change=>change.data.workItems?.some(task=>task.title==='Check my delivery checklist'))).toBe(true);
 const change=calls.flatMap(call=>call.p_changes).find(change=>change.data.workItems?.some(task=>task.title==='Check my delivery checklist'));expect(change.id).toBe('EVE-2026-001');const task=change.data.workItems.find(task=>task.title==='Check my delivery checklist');expect(task.assignee_user_id).toBe(tables.workspace_members[0].user_id);expect(task.assignees).toEqual([{name:'Alex Morgan',userId:tables.workspace_members[0].user_id}]);expect(task.status).toBe('TO_DO');expect(task.deadline).toMatch(/Z$/);expect(change.data.team).toHaveLength(tables.project_team_members.length);
 const row=page.locator('tr').filter({hasText:'Check my delivery checklist'});await expect(row).toBeVisible();await expect(row.locator('.task-assignee-cell')).toContainText('Alex Morgan');
 await page.getByRole('link',{name:'Projects',exact:true}).first().click();await page.goto('/projects/EVE-2026-001');await page.getByRole('button',{name:'Create task',exact:true}).click();await expect(page.getByRole('dialog',{name:'Create task',exact:true})).toBeVisible();
});

test('employees without assignments cannot create a task for an unrelated project',async({page})=>{
 await mockWorkspace(page,{role:'employee'});await page.route('**/rest/v1/project_team_members?*',route=>route.fulfill({json:[]}));await page.route('**/rest/v1/project_work_items?*',route=>route.fulfill({json:[]}));await page.goto('/work');await page.getByRole('button',{name:'Create task',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Create task',exact:true});await expect(dialog.getByRole('group',{name:'Projects',exact:true}).getByRole('checkbox')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Create task',exact:true})).toBeDisabled();
});
