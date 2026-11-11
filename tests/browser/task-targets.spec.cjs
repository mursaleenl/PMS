const {test,expect}=require('@playwright/test');
const {mockWorkspace,tables}=require('./fixtures.cjs');

test('dispatch one task to all projects with multiple assignees and descriptions',async({page})=>{
 const {calls}=await mockWorkspace(page);await page.goto('/projects/EVE-2026-001');await page.getByRole('button',{name:'Dispatch task',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Dispatch task',exact:true});
 await dialog.getByRole('button',{name:'Select all projects',exact:true}).click();
 await dialog.getByRole('textbox',{name:'Task title',exact:true}).fill('Shared launch checklist');await dialog.getByRole('textbox',{name:'Description',exact:true}).fill('Check links and confirm the launch is ready.');
 for(const name of ['Alex Morgan','Jordan Lee'])await dialog.getByRole('group',{name:'Assignees',exact:true}).getByRole('checkbox',{name,exact:true}).check();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);if(width===390)await dialog.screenshot({path:"/private/tmp/pms-task-targets.png",animations:"disabled"});}
 await dialog.getByRole('button',{name:'Dispatch to tasks',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='projects').length).toBe(2);
 const changes=calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='projects');const dispatched=changes.map(change=>change.data.workItems.find(task=>task.title==='Shared launch checklist'));
 expect(dispatched.every(Boolean)).toBe(true);expect(new Set(dispatched.map(task=>task.external_id)).size).toBe(2);
 for(const task of dispatched){expect(task.assignees).toEqual([{name:'Alex Morgan',userId:'00000000-0000-0000-0000-000000000001'},{name:'Jordan Lee',userId:'00000000-0000-0000-0000-000000000002'}]);expect(task.description).toBe('Check links and confirm the launch is ready.');}
 await page.getByRole('link',{name:'Tasks',exact:true}).first().click();const rows=page.locator('tbody tr').filter({hasText:'Shared launch checklist'});await expect(rows).toHaveCount(2);
 await expect(rows.first().locator('.task-assignee-cell')).toContainText('Alex Morgan, Jordan Lee');
 await page.getByRole('combobox',{name:'Filter by assignee',exact:true}).selectOption('Jordan Lee');await expect(rows).toHaveCount(2);
});

test('a secondary assignee sees and can update the shared task on the Tasks board',async({page})=>{
 const {calls}=await mockWorkspace(page,{role:'employee'});
 await page.route('**/rest/v1/project_work_items?*',route=>route.fulfill({json:[{...tables.project_work_items[0],status:'TO_DO',assignee_user_id:tables.workspace_members[1].user_id,assignee_name:'Jordan Lee',assignees:[{userId:tables.workspace_members[1].user_id,name:'Jordan Lee'},{userId:tables.workspace_members[0].user_id,name:'Alex Morgan'}]}]}));
 await page.goto('/work');const task=page.getByRole('checkbox',{name:'Mark Build the homepage experience complete',exact:true});await expect(task).toBeVisible();await task.check();
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).some(change=>change.data.workItems?.some(task=>task.external_id==='TASK1'&&task.status==='DONE'))).toBe(true);
});

test('Tasks page can target selected projects and retry a bulk save without duplicating tasks',async({page})=>{
 await mockWorkspace(page);const writes=[];let fail=true;
 await page.route('**/rest/v1/rpc/save_workspace_changes',route=>{const body=route.request().postDataJSON();writes.push(body);if(fail)return route.fulfill({status:400,json:{message:'Temporary save failure'}});return route.fulfill({json:Object.fromEntries(body.p_changes.map(change=>[`${change.collection}:${change.id}`,change.expectedRevision===null?0:change.expectedRevision+1]))});});
 await page.goto('/work');await page.getByRole('button',{name:'Assign task',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Assign task',exact:true});
 await dialog.getByRole('group',{name:'Projects',exact:true}).getByRole('checkbox',{name:'Customer experience platform',exact:true}).check();
 await dialog.getByRole('textbox',{name:'Task title',exact:true}).fill('Retry-safe shared task');await dialog.getByRole('group',{name:'Assignees',exact:true}).getByRole('checkbox',{name:'Jordan Lee',exact:true}).check();
 await dialog.getByRole('button',{name:'Assign task',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();
 const first=writes.flatMap(write=>write.p_changes).find(change=>change.collection==='projects');const id=first.data.workItems.find(task=>task.title==='Retry-safe shared task').external_id;
 fail=false;await dialog.getByRole('button',{name:'Retry saving',exact:true}).click();await expect(dialog).not.toBeVisible();
 for(const write of writes)for(const change of write.p_changes){expect(change.id).toBe('EVE-2026-002');const tasks=change.data.workItems.filter(task=>task.title==='Retry-safe shared task');expect(tasks).toHaveLength(1);expect(tasks[0].external_id).toBe(id);}
});
