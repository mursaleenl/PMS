const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');const {readDatabaseSection}=require('../scripts/database-sql.cjs');
test('QA reports persist, assignments create one real task atomically, and employee/client scope is enforced',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
  await db.exec(fs.readFileSync('supabase/main-database.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  const admin='00000000-0000-0000-0000-000000000001',employee='00000000-0000-0000-0000-000000000002',client='00000000-0000-0000-0000-000000000003';
  for(const [id,role] of [[admin,'admin'],[employee,'employee'],[client,'client']]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${role}@example.com`]);await db.query('insert into workspace_members(user_id,email,display_name,role) values($1,$2,$3,$3)',[id,`${role}@example.com`,role]);}
  const identity=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  await db.exec("insert into projects(external_id,title,project_type,status) values('QA-PROJECT','QA project','internal','ACTIVE'),('OTHER','Other','internal','ACTIVE')");
  await db.query("insert into project_team_members(project_id,role,name,user_id) select id,'Developer','employee',$1 from projects where external_id='QA-PROJECT'",[employee]);
  const submit=(id,kind='BUG',project='QA-PROJECT',assigned=employee)=>db.query("select submit_qa_report($1,$2,'Booking is broken','The booking confirmation does not appear.',$3,$4)",[id,kind,project,assigned]);
  const report='10000000-0000-0000-0000-000000000001';await identity(admin);await submit(report);await submit(report);
  assert.equal((await db.query('select count(*)::int n from qa_reports')).rows[0].n,1);
  const task=(await db.query("select * from project_work_items where external_id=$1",['QA-'+report])).rows[0];assert.equal(task.kind,'QA_BUG');assert.equal(task.assignee_user_id,employee);assert.equal(task.description,'The booking confirmation does not appear.');
  assert.equal((await db.query("select revision,status from projects where external_id='QA-PROJECT'")).rows[0].revision,1);
  await db.query('select assign_qa_report($1,$2,$3)',[report,'QA-PROJECT',employee]);assert.equal((await db.query('select count(*)::int n from project_work_items')).rows[0].n,1);
  await assert.rejects(submit('10000000-0000-0000-0000-000000000002','BUG','QA-PROJECT',client),/workspace directory/);assert.equal((await db.query('select count(*)::int n from qa_reports')).rows[0].n,1);
  const general='10000000-0000-0000-0000-000000000003';await submit(general,'IMPROVEMENT',null,null);await db.query('select assign_qa_report($1,$2,$3)',[general,'QA-PROJECT',employee]);assert.equal((await db.query('select kind from project_work_items where external_id=$1',['QA-'+general])).rows[0].kind,'FEATURE_DEV');
  const change='10000000-0000-0000-0000-000000000004';await submit(change,'CHANGE','QA-PROJECT',null);await assert.rejects(db.query('select assign_qa_report($1,$2,$3)',[change,'OTHER',employee]),/report project/);
  await identity(employee);const own='10000000-0000-0000-0000-000000000005';await submit(own,'CHANGE','QA-PROJECT',employee);
  await assert.rejects(submit('10000000-0000-0000-0000-000000000006','BUG','OTHER',employee),/assigned projects/);
  await assert.rejects(submit('10000000-0000-0000-0000-000000000007','BUG','QA-PROJECT',admin),/yourself/);
  await assert.rejects(db.query('select assign_qa_report($1,$2,$3)',[change,'QA-PROJECT',employee]),/own reports/);
  await assert.rejects(db.query("insert into qa_reports(kind,title,details,created_by) values('BUG','x','x',$1)",[employee]),/permission denied/);
  assert.equal((await db.query('select count(*)::int n from qa_reports')).rows[0].n,4);
  const screenshot='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const imageId='10000000-0000-0000-0000-000000000009';
  const saveImage=(image)=>db.query("select submit_qa_report($1,'BUG','Visual bug','See the attached image.','QA-PROJECT',null,$2,'screenshot.png')",[imageId,image]);
  await saveImage(screenshot);await saveImage(screenshot);assert.equal((await db.query('select image_data_url from qa_reports where id=$1',[imageId])).rows[0].image_data_url,screenshot);
  await assert.rejects(saveImage('data:image/svg+xml;base64,PHN2Zy8+'),/compressed PNG/);
  await assert.rejects(saveImage('data:image/png;base64,'+Buffer.alloc(358401,1).toString('base64')),/compressed PNG/);
  await assert.rejects(saveImage('data:image/png;base64,%%%'),/compressed PNG/);
  await identity(client);assert.equal((await db.query('select count(*)::int n from qa_reports')).rows[0].n,0);await assert.rejects(submit('10000000-0000-0000-0000-000000000008'),/membership required/);
  await db.exec('reset role');await db.exec(readDatabaseSection('qa-reports'));await db.exec(readDatabaseSection('qa-report-images'));assert.equal((await db.query('select count(*)::int n from qa_reports')).rows[0].n,5);
 }finally{await db.close();}
});
