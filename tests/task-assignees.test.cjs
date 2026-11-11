const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');const {createLoader}=require('../scripts/test-loader.cjs');
const load=createLoader();const {serializeRecord}=load('lib/relational-sync.ts');
const {readDatabaseSection}=require('../scripts/database-sql.cjs');

test('all task assignees receive access and notifications, can update progress, and cannot change assignments',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
  await db.exec(fs.readFileSync('supabase/main-database.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  const admin='00000000-0000-0000-0000-000000000001',employee='00000000-0000-0000-0000-000000000002',outsider='00000000-0000-0000-0000-000000000003',client='00000000-0000-0000-0000-000000000004';
  for(const [id,role] of [[admin,'admin'],[employee,'employee'],[outsider,'employee'],[client,'client']]){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${role}-${id}@example.com`]);
   await db.query('insert into workspace_members(user_id,email,role) values($1,$2,$3)',[id,`${role}-${id}@example.com`,role]);
  }
  const identity=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const save=async(projects,revisions)=>db.query('select save_workspace_changes($1::jsonb)',[JSON.stringify(projects.map((project,index)=>({collection:'projects',id:project.id,operation:'save',expectedRevision:revisions[index],data:serializeRecord('projects',project)})))]);
  await identity(admin);
  const task=id=>({id,title:'Shared task',assignee:'Admin',assigneeId:admin,assignees:[{name:'Admin',userId:admin},{name:'Employee',userId:employee}],kind:'FEATURE_DEV',priority:'P3',estimatedHours:0,loggedHours:0,status:'TO_DO',createdAt:'2026-11-11T00:00:00Z',deadline:'2026-12-01T15:30:00.000Z'});
  const project=(id,taskId)=>({id,leadId:'',projectType:'internal',createdAt:'2026-11-11T00:00:00Z',title:id,clientCompany:'',clientName:'',clientEmail:'',services:[],classification:'New Client',startDate:'2026-11-11',billingStructure:'Fixed',contractedValue:0,currency:'USD',proposalVersion:0,scopeIncluded:'',scopeExcluded:'',assumptions:'',revisionRounds:0,team:[],workItems:[task(taskId)],status:'ON_TRACK'});
  const first=project('BULK-ONE','TASK-ONE'),second=project('BULK-TWO','TASK-TWO');
  const invalidBatch=structuredClone(second);invalidBatch.workItems[0].assigneeId=client;invalidBatch.workItems[0].assignees=[{name:'Client',userId:client}];
  await assert.rejects(save([first,invalidBatch],[null,null]),/workspace directory/);
  assert.equal((await db.query('select count(*)::int total from projects')).rows[0].total,0);
  assert.equal((await db.query('select count(*)::int total from workspace_notifications')).rows[0].total,0);
  await save([first,second],[null,null]);
  assert.equal(new Date((await db.query("select deadline from project_work_items where external_id='TASK-ONE'")).rows[0].deadline).toISOString(),first.workItems[0].deadline);
  const notices=(await db.query("select recipient_id,count(*)::int total from workspace_notifications where type='TASK' group by recipient_id order by recipient_id")).rows;
  assert.deepEqual(notices,[{recipient_id:admin,total:2},{recipient_id:employee,total:2}]);
  await identity(employee);await db.exec('set role authenticated');
  assert.equal((await db.query('select id from projects')).rows.length,2);assert.equal((await db.query('select id from project_work_items')).rows.length,2);
  first.workItems[0].status='DONE';await save([first],[0]);
  assert.equal((await db.query("select status from project_work_items where external_id='TASK-ONE'")).rows[0].status,'DONE');
  assert.equal((await db.query("select status from project_work_items where external_id='TASK-TWO'")).rows[0].status,'TO_DO');
  const rescheduled=structuredClone(first);rescheduled.workItems[0].deadline='2026-12-02T15:30:00.000Z';await assert.rejects(save([rescheduled],[1]),/Employees can update only/);
  const forged=structuredClone(first);forged.workItems[0].assignees=[{name:'Employee',userId:employee}];forged.workItems[0].assignee='Employee';forged.workItems[0].assigneeId=employee;
  await assert.rejects(save([forged],[1]),/Employees can update only/);
  await db.exec('reset role');await identity(outsider);await db.exec('set role authenticated');
  assert.equal((await db.query('select id from projects')).rows.length,0);await assert.rejects(save([first],[1]),/Employees can update only/);
  await db.exec('reset role');await identity(admin);
  const invalid=structuredClone(first);invalid.workItems[0].assigneeId=client;invalid.workItems[0].assignees=[{name:'Client',userId:client}];
  await assert.rejects(save([invalid],[1]),/workspace directory/);
  assert.equal((await db.query("select count(*)::int total from workspace_notifications where type='TASK'")).rows[0].total,4);
  // The standalone upgrade must also replace checks in an older deployed RPC.
  for(const signature of ['public.employee_project_task_update_allowed(uuid,jsonb)','public.employee_can_access_project(uuid)','public.save_workspace_changes(jsonb,uuid)']){
   const definition=(await db.query('select pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
   await db.exec(definition.replaceAll('public.is_task_assignee(row_id)','(select assignee_user_id from public.project_work_items where id=row_id) = auth.uid()').replaceAll('public.is_task_assignee(w.id)','w.assignee_user_id=auth.uid()'));
  }
  const guard=(await db.query("select pg_get_functiondef('public.employee_project_task_update_allowed(uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
  await db.exec(guard.replaceAll("if field_name in ('created_at','deadline') then","if field_name='created_at' then"));
  await db.exec(readDatabaseSection('task-deadlines'));await db.exec(readDatabaseSection('task-deadlines'));
  await db.exec(readDatabaseSection('multiple-task-assignees'));await db.exec(readDatabaseSection('multiple-task-assignees'));
  await identity(employee);await db.exec('set role authenticated');second.workItems[0].status='IN_PROGRESS';await save([second],[0]);
  assert.equal((await db.query("select status from project_work_items where external_id='TASK-TWO'")).rows[0].status,'IN_PROGRESS');
  // Employees can add only new self-assigned tasks and must preserve the rest of the project graph.
  await db.exec('reset role');await identity(admin);
  const teamProject=project('SELF-TEAM','unused');teamProject.workItems=[];teamProject.status='ACTIVE';teamProject.team=[{name:'Employee',userId:employee,role:'Developer',allocationPercent:50}];
  const hiddenProject=project('SELF-HIDDEN','unused');hiddenProject.workItems=[];
  await save([teamProject,hiddenProject],[null,null]);
  await db.exec(readDatabaseSection('employee-self-service-tasks'));await db.exec(readDatabaseSection('employee-self-service-tasks'));
  await identity(employee);await db.exec('set role authenticated');
  const mine={...task('SELF-NEW'),assignee:'Employee',assigneeId:employee,assignees:[{name:'Employee',userId:employee}],description:'My own delivery task',estimatedHours:2};
  const selfProject=structuredClone(teamProject);selfProject.status='ON_TRACK';selfProject.workItems=[mine];
  const other=structuredClone(selfProject);other.workItems[0].assigneeId=admin;other.workItems[0].assignees=[{name:'Admin',userId:admin}];await assert.rejects(save([other],[0]),/Employees can update only/);
  const many=structuredClone(selfProject);many.workItems[0].assignees.push({name:'Admin',userId:admin});await assert.rejects(save([many],[0]),/Employees can update only/);
  const unrelated=structuredClone(hiddenProject);unrelated.workItems=[mine];await assert.rejects(save([unrelated],[0]),/Employees can update only/);
  const changed=structuredClone(selfProject);changed.title='Unauthorized rename';await assert.rejects(save([changed],[0]),/Employees can update only/);
  const precompleted=structuredClone(selfProject);precompleted.workItems[0].status='DONE';await assert.rejects(save([precompleted],[0]),/Employees can update only/);
  await save([selfProject],[0]);
  assert.equal((await db.query("select assignee_user_id,status from project_work_items where external_id='SELF-NEW'")).rows[0].assignee_user_id,employee);
  assert.equal((await db.query("select status from projects where external_id='SELF-TEAM'")).rows[0].status,'ON_TRACK');
  const removed=structuredClone(selfProject);removed.workItems=[];await assert.rejects(save([removed],[1]),/Employees can update only/);
  selfProject.workItems[0].status='IN_PROGRESS';await save([selfProject],[1]);
  assert.equal((await db.query("select status from project_work_items where external_id='SELF-NEW'")).rows[0].status,'IN_PROGRESS');
  // Access through an existing task also permits self creation without changing the team roster.
  second.workItems.unshift({...mine,id:'SELF-SECOND',status:'TO_DO'});await save([second],[1]);
  assert.equal((await db.query("select count(*)::int total from project_work_items where external_id='SELF-SECOND'")).rows[0].total,1);
 }finally{await db.close();}
});

test('task assignee helpers preserve legacy assignments and include every selected person in the project team',()=>{
 const sync=load('lib/workspace-sync.ts'),projects=load('lib/projects.ts');global.window=new EventTarget();sync.clearWorkspaceMemory();
 const task={id:'task',title:'Shared task',assignee:'Alex',assigneeId:'alex',assignees:[{name:'Alex',userId:'alex'},{name:'Jordan',userId:'jordan'}],status:'TO_DO'};
 assert.equal(projects.isTaskAssignedToUser(task,'jordan'),true);assert.equal(projects.isTaskAssignedToUser(task,'outsider','Jordan'),false);
 assert.equal(projects.getTaskAssigneeLabel(task),'Alex, Jordan');
 sync.applyRemoteCollection('projects',[{id:'project',title:'Project',team:[],workItems:[],status:'ACTIVE'}]);
 projects.updateProject('project',{workItems:[task]});const updated=projects.readProjects()[0];
 assert.deepEqual(updated.team.map(person=>person.userId),['alex','jordan']);assert.equal(updated.status,'ON_TRACK');
 assert.equal(projects.isTaskAssignedToUser({assignee:'Legacy user'},null,'Legacy user'),true);
});
