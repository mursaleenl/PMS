const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');

test('blocking can be cancelled, rejects blank reasons, and lets existing reasons be edited',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.goto('/work');
 const status=page.getByRole('combobox',{name:'Status for Review navigation and content structure',exact:true});
 const dialog=page.getByRole('dialog',{name:'Block task',exact:true});
 await status.selectOption('BLOCKED');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(status).toHaveValue('TO_DO');
 await status.selectOption('BLOCKED');
 await dialog.getByRole('textbox',{name:'Reason',exact:true}).fill('   ');
 await dialog.getByRole('button',{name:'Block task',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Enter a reason');
 await dialog.getByRole('textbox',{name:'Reason',exact:true}).fill('Waiting for access');
 await dialog.getByRole('button',{name:'Block task',exact:true}).click();
 await expect(status).toHaveValue('BLOCKED');
 await page.getByRole('button',{name:'Edit reason',exact:true}).click();
 await expect(dialog.getByRole('textbox',{name:'Reason',exact:true})).toHaveValue('Waiting for access');
 await dialog.getByRole('textbox',{name:'Reason',exact:true}).fill('Waiting for client approval');
 await dialog.getByRole('button',{name:'Block task',exact:true}).click();
 await expect(page.locator('.task-blocker-reason')).toHaveText('Waiting for client approval');
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='projects').at(-1)?.data.workItems.find(task=>task.external_id==='TASK2')?.blocker_reason).toBe('Waiting for client approval');
});

test('list status changes save immediately, follow the task without popups; assignees are read-only',async({page})=>{
 const {calls}=await mockWorkspace(page);
 await page.goto('/work');
 const status=page.getByRole('combobox',{name:'Status for Review navigation and content structure',exact:true});
 await expect(page.locator('.task-assignee-cell select')).toHaveCount(0);
 for(const value of ['IN_PROGRESS','UNDER_REVIEW','DONE','TO_DO']){
  await status.selectOption(value);
  if(value==='BLOCKED'){
   const dialog=page.getByRole('dialog',{name:'Block task',exact:true});
   await dialog.getByRole('textbox',{name:'Reason',exact:true}).fill('Waiting for client access');
   await dialog.getByRole('button',{name:'Block task',exact:true}).click();
   await expect(page.locator('.task-blocker-reason')).toHaveText('Waiting for client access');
  }
  await expect(status).toHaveValue(value);
  await expect(page.getByLabel('Filter tasks by status')).toHaveValue(value);
 }
 await expect(page.getByRole('button',{name:'Undo',exact:true})).toHaveCount(0);
 await expect(page.getByText('Task changes sync automatically',{exact:true})).toHaveCount(0);
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='projects').at(-1)?.data.workItems.find(task=>task.external_id==='TASK2')?.status).toBe('TO_DO');
 await page.getByRole('button',{name:'Board',exact:true}).click();
 await expect(page.locator('.task-kanban-assignee select')).toHaveCount(0);
});

test('the status dropdown collects and saves a blocker reason without a browser prompt',async({page})=>{
 const {calls}=await mockWorkspace(page);
 const prompts=[];
 page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss();});
 await page.goto('/work');
 const status=page.getByRole('combobox',{name:'Status for Review navigation and content structure',exact:true});
 for(const value of ['BLOCKED','TO_DO','BLOCKED','IN_PROGRESS','BLOCKED','DONE']){
  await status.selectOption(value);
  if(value==='BLOCKED'){
   const dialog=page.getByRole('dialog',{name:'Block task',exact:true});
   await dialog.getByRole('textbox',{name:'Reason',exact:true}).fill('Waiting for client access');
   await dialog.getByRole('button',{name:'Block task',exact:true}).click();
   await expect(page.locator('.task-blocker-reason')).toHaveText('Waiting for client access');
  }
  await expect(status).toHaveValue(value);
  await expect(page.getByLabel('Filter tasks by status')).toHaveValue(value);
 }
 expect(prompts).toEqual([]);
 await expect.poll(()=>calls.flatMap(call=>call.p_changes).filter(change=>change.collection==='projects').at(-1)?.data.workItems.find(task=>task.external_id==='TASK2')?.status).toBe('DONE');
});
