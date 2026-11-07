const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('cards can be dropped in the space below the last card of a populated column',async({page})=>{
 await mockWorkspace(page);
 await page.goto('/work');
 await page.getByRole('button',{name:'Board',exact:true}).click();
 const column=status=>page.locator('.task-kanban-column').filter({has:page.locator(`.status-badge[data-status="${status}"]`)});
 const target=column('TO_DO');
 const body=target.locator('.task-kanban-column-body');
 const cardBox=await target.locator('.task-kanban-card').last().boundingBox();
 const bodyBox=await body.boundingBox();
 expect(bodyBox.y+bodyBox.height-cardBox.y-cardBox.height).toBeGreaterThanOrEqual(80);
 const source=column('IN_PROGRESS').locator('.task-kanban-card').filter({hasText:'Build the homepage experience'});
 await source.dragTo(body,{targetPosition:{x:bodyBox.width/2,y:cardBox.y+cardBox.height-bodyBox.y+64}});
 await expect(target.getByRole('heading',{name:'Build the homepage experience',exact:true})).toBeVisible();
 await expect(target.locator('.task-kanban-card')).toHaveCount(2);
});

test('an older background snapshot cannot remove tasks after a move is saved',async({page})=>{
 await mockWorkspace(page);
 const {tables}=require('./fixtures.cjs');
 let saved=false,refreshes=0;
 await page.route('**/rest/v1/project_work_items?*',route=>route.fulfill({json:saved?[]:tables.project_work_items}));
 await page.route('**/rest/v1/rpc/workspace_schema_version',async route=>{
  await route.fulfill({json:1});
  if(saved)refreshes++;
 });
 await page.route('**/rest/v1/rpc/save_workspace_changes',async route=>{
  const body=route.request().postDataJSON();
  saved=true;
  await route.fulfill({json:Object.fromEntries(body.p_changes.map(change=>[`${change.collection}:${change.id}`,change.expectedRevision+1]))});
 });
 await page.goto('/work');
 await page.getByRole('button',{name:'Board',exact:true}).click();
 await page.getByRole('checkbox',{name:'Mark Review navigation and content structure complete',exact:true}).click();
 await expect.poll(async()=>{
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  return refreshes;
 }).toBeGreaterThan(0);
 // Let React commit the completed refresh before checking the board.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(page.locator('.task-kanban-card')).toHaveCount(3);
 await expect(page.getByRole('checkbox',{name:'Mark Review navigation and content structure incomplete',exact:true})).toBeVisible();
});

test('reopening a completed task follows it to the to-do list without refreshing',async({page})=>{
 await mockWorkspace(page);
 await page.goto('/work');
 await page.getByRole('checkbox',{name:'Mark Review navigation and content structure complete',exact:true}).click();
 await expect(page.getByLabel('Filter tasks by status')).toHaveValue('DONE');
 await page.getByRole('checkbox',{name:'Mark Review navigation and content structure incomplete',exact:true}).click();
 await expect(page.getByLabel('Filter tasks by status')).toHaveValue('TO_DO');
 await expect(page.getByRole('checkbox',{name:'Mark Review navigation and content structure complete',exact:true})).toBeVisible();
});

test('a task stays visible through repeated moves, including Blocked, while saves are pending',async({page})=>{
 const prompts=[];
 page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss();});
 await mockWorkspace(page);
 let releaseSave;
 const saveGate=new Promise(resolve=>{releaseSave=resolve;});
 await page.route('**/rest/v1/rpc/save_workspace_changes',async route=>{
  await saveGate;
  const body=route.request().postDataJSON();
  await route.fulfill({json:Object.fromEntries(body.p_changes.map(change=>[`${change.collection}:${change.id}`,change.expectedRevision+1]))});
 });
 await page.goto('/work');
 await page.getByRole('button',{name:'Board',exact:true}).click();
 const column=status=>page.locator('.task-kanban-column').filter({has:page.locator(`.status-badge[data-status="${status}"]`)});
 const task=()=>page.locator('.task-kanban-card').filter({hasText:'Review navigation and content structure'});
 for(const status of ['BLOCKED','TO_DO','BLOCKED','IN_PROGRESS','UNDER_REVIEW','BLOCKED','DONE','TO_DO','DONE']){
  await task().dragTo(column(status).locator('.task-kanban-column-body'));
  if(status==='BLOCKED'){
   const dialog=page.getByRole('dialog',{name:'Block task',exact:true});
   await dialog.getByRole('textbox',{name:'Reason',exact:true}).fill('Waiting for client access');
   await dialog.getByRole('button',{name:'Block task',exact:true}).click();
   await expect(column(status).locator('.task-kanban-blocker-note')).toContainText('Waiting for client access');
  }
  await expect(column(status).locator('.task-kanban-card').filter({hasText:'Review navigation and content structure'})).toBeVisible();
  await expect(page.locator('.task-kanban-card')).toHaveCount(3);
  await expect(page.locator('.task-kanban-card.is-dragging')).toHaveCount(0);
 }
 await task().getByRole('checkbox').click();
 await expect(column('TO_DO').locator('.task-kanban-card').filter({hasText:'Review navigation and content structure'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Undo',exact:true})).toHaveCount(0);
 expect(prompts).toEqual([]);
 releaseSave();
});

test('the board ignores a completed list filter and keeps a reopened card in its new column',async({page})=>{
 await mockWorkspace(page);
 await page.goto('/work');
 await page.getByRole('checkbox',{name:'Mark Review navigation and content structure complete',exact:true}).click();
 await page.getByRole('button',{name:'Board',exact:true}).click();
 const column=status=>page.locator('.task-kanban-column').filter({has:page.locator(`.status-badge[data-status="${status}"]`)});
 const task=column('DONE').locator('.task-kanban-card').filter({hasText:'Review navigation and content structure'});
 await expect(task).toBeVisible();
 await task.dragTo(column('TO_DO').locator('.task-kanban-column-body'));
 await expect(column('TO_DO').getByRole('heading',{name:'Review navigation and content structure',exact:true})).toBeVisible();
 await expect(column('DONE').getByRole('heading',{name:'Review navigation and content structure',exact:true})).toHaveCount(0);
});
