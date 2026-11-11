const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');const {readDatabaseSection}=require('../scripts/database-sql.cjs');const {createLoader}=require('../scripts/test-loader.cjs');const {serializeRecord}=createLoader()('lib/relational-sync.ts');
test('general tasks save without projects, support multiple assignees and revisions, and enforce employee scope',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
  await db.exec(fs.readFileSync('supabase/main-database.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  const admin='00000000-0000-0000-0000-000000000001',employee='00000000-0000-0000-0000-000000000002',outsider='00000000-0000-0000-0000-000000000003',client='00000000-0000-0000-0000-000000000004';
  for(const [id,role] of [[admin,'admin'],[employee,'employee'],[outsider,'employee'],[client,'client']]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@example.com`]);await db.query('insert into workspace_members(user_id,email,display_name,role) values($1,$2,$3,$3)',[id,`${id}@example.com`,role]);}
  const identity=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const save=(task,revision)=>db.query('select save_workspace_changes($1::jsonb)',[JSON.stringify([{collection:'generalTasks',operation:'save',id:task.id,expectedRevision:revision,data:serializeRecord('generalTasks',task)}])]);
  const task={id:'GENERAL-ONE',title:'Prepare the internal checklist',description:'No client project needed.',assignee:'Admin',assigneeId:admin,assignees:[{name:'Admin',userId:admin},{name:'Employee',userId:employee}],kind:'FEATURE_DEV',priority:'P3',estimatedHours:2,loggedHours:0,status:'TO_DO',createdAt:'2026-11-11T12:00:00.000Z',deadline:'2026-12-10T12:00:00.000Z'};
  await identity(admin);await save(task,null);assert.equal((await db.query('select count(*)::int n from projects')).rows[0].n,0);await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from workspace_notifications')).rows[0].n,2);await db.exec('set role authenticated');
  task.title='Updated checklist';await save(task,0);await assert.rejects(save(task,0),/CONFLICT/);
  await identity(employee);assert.equal((await db.query('select task from general_tasks')).rows[0].task.title,'Updated checklist');task.status='IN_PROGRESS';await save(task,1);
  await assert.rejects(save({...task,title:'Changed by employee'},2),/only their assigned progress/);await assert.rejects(save({...task,deadline:'2026-12-11T12:00:00Z'},2),/only their assigned progress/);
  const mine={...task,id:'MY-GENERAL',status:'TO_DO',assignee:'Employee',assigneeId:employee,assignees:[{name:'Employee',userId:employee}]};await save(mine,null);
  await assert.rejects(save({...mine,id:'FORGED',assigneeId:admin,assignee:'Admin',assignees:[{name:'Admin',userId:admin}]},null),/for themselves/);
  await assert.rejects(save({...mine,id:'MISSING',assigneeId:undefined},null),/for themselves/);
  await identity(outsider);assert.equal((await db.query('select count(*)::int n from general_tasks')).rows[0].n,0);await assert.rejects(save({...task,status:'DONE'},2),/only their assigned progress/);
  await identity(client);assert.equal((await db.query('select count(*)::int n from general_tasks')).rows[0].n,0);await assert.rejects(save({...mine,id:'CLIENT'},null),/membership required/);
  await identity(admin);const report='10000000-0000-0000-0000-000000000001';await db.query("select submit_qa_report($1,'IMPROVEMENT','Improve reporting','Make the report clearer.',null,$2)",[report,employee]);await db.query('select assign_qa_report($1,null,$2)',[report,employee]);assert.equal((await db.query('select count(*)::int n from general_tasks')).rows[0].n,3);assert.equal((await db.query('select count(*)::int n from projects')).rows[0].n,0);
  await db.exec('reset role');
  // Simulate the previously deployed graph RPC before applying the standalone upgrade.
  let legacy=(await db.query("select pg_get_functiondef('public.save_workspace_changes(jsonb,uuid)'::regprocedure) definition")).rows[0].definition;
  legacy=legacy.replace("when 'generalTasks' then 'general_tasks' ","")
   .replace("      if collection_name='generalTasks' then\n        if change->>'operation'<>'save' or not coalesce(public.employee_general_task_save_allowed(root_id,change->'data'->'row'->'task'),false) then raise exception 'Employees can create general tasks for themselves and update only their assigned progress.'; end if;\n      else\n","")
   .replace("raise exception 'Employees can update only their own assigned task progress.';\n      end if;\n      end if;\n    end if;","raise exception 'Employees can update only their own assigned task progress.';\n      end if;\n    end if;")
   .replace("    elsif collection_name='generalTasks' then\n      payload=payload||jsonb_build_object('created_by',auth.uid());\n","");
  assert.equal(legacy.includes('employee_general_task_save_allowed'),false);await db.exec(legacy);
  await db.exec(readDatabaseSection('general-tasks'));await db.exec(readDatabaseSection('general-tasks'));await db.exec(readDatabaseSection('general-qa-tasks'));await identity(employee);mine.status='DONE';await save(mine,0);
  assert.equal((await db.query("select task->>'status' status from general_tasks where external_id='MY-GENERAL'")).rows[0].status,'DONE');
 }finally{await db.close();}
});
