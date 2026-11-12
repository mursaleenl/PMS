const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { createLoader } = require('../scripts/test-loader.cjs');
const load = createLoader();
const { serializeRecord, readRelationalWorkspace } = load('lib/relational-sync.ts');
const { createInternalProject } = createLoader({'@/lib/numbering': { reserveWorkspaceNumber: async () => 'INTERNAL-1' }})('lib/projects.ts');

const admin = '00000000-0000-0000-0000-000000000001';
const manager = '00000000-0000-0000-0000-000000000003';
const employee = '00000000-0000-0000-0000-000000000002';

test('main database installs fresh, preserves populated records on rerun, and upgrades retired stages', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
    const sql = fs.readFileSync('supabase/main-database.sql', 'utf8').replace('create extension if not exists pgcrypto;', '');
    await db.exec(sql);
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'admin@example.com',now()),($2,'employee@example.com',now())", [admin, employee]);
    await db.query("insert into workspace_members(user_id,email,role,display_name) values($1,'admin@example.com','admin','Admin'),($2,'employee@example.com','employee','Employee')", [admin, employee]);
    await db.query("insert into auth.users(id,email) values($1,'manager@example.com')", [manager]);
    await db.query("insert into workspace_members(user_id,email,role) values($1,'manager@example.com','project_manager')", [manager]);
    const lead = (await db.query("insert into leads(external_id,full_name,email,status,qualification) values('KEEP-LEAD','Client','client@example.com','NEW','{\"proposalAttachment\":{\"name\":\"scope.pdf\",\"dataUrl\":\"data:application/pdf;base64,JVBERg==\"}}') returning id")).rows[0].id;
    const project = (await db.query("insert into projects(external_id,lead_id,title,status) values('KEEP-PROJECT',$1,'Keep this project','ON_TRACK') returning id", [lead])).rows[0].id;
    await db.query("insert into proposals(lead_id,proposal_title,share_token,status,quoted_amount) values($1,'Keep this proposal','keep-public-token','SENT',1200)", [lead]);
    await db.query("insert into project_team_members(project_id,user_id,role,name) values($1,$2,'Project Manager','Manager')", [project, manager]);
    await db.query("insert into project_work_items(project_id,external_id,title,kind,assignee_user_id,assignee_name) values($1,'KEEP-TASK','Keep this task','FEATURE_DEV',$2,'Employee')", [project, employee]);
    await db.query("insert into attendance_sessions(user_id,work_date,checked_in_at,checked_out_at,checkin_token,checkout_token) values($1,'2026-11-03','2026-11-03T08:00:00Z','2026-11-03T10:00:00Z',gen_random_uuid(),gen_random_uuid())", [employee]);
    for (const ineligible of [employee, null]) {
      await assert.rejects(db.query("insert into project_team_members(project_id,user_id,role,name) values($1,$2,'Project Manager','Invalid')", [project, ineligible]), /Only administrators and users with the Project Manager role/);
    }
    await assert.rejects(db.query("update project_team_members set user_id=$1 where project_id=$2 and role='Project Manager'", [employee, project]), /Only administrators and users with the Project Manager role/);
    await db.query("insert into project_team_members(project_id,user_id,role,name) values($1,$2,'Project Manager','Admin')",[project,admin]);
    assert.equal((await db.query('select role from workspace_members where user_id=$1',[admin])).rows[0].role,'admin');
    // Eligible role changes must preserve the project assignment.
    await db.query("update workspace_members set role='admin' where user_id=$1",[manager]);
    assert.equal((await db.query("select * from project_team_members where user_id=$1 and role='Project Manager'",[manager])).rows.length,1);
    await db.query("update workspace_members set role='project_manager' where user_id=$1",[manager]);
    assert.equal((await db.query("select * from project_team_members where user_id=$1 and role='Project Manager'",[manager])).rows.length,1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select id from projects')).rows.length, 1);
    assert.equal((await db.query('select id from leads')).rows.length, 1);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    const clientsBefore = (await db.query('select count(*)::int n from clients')).rows[0].n;
    const internal = await createInternalProject({ title: 'Internal tooling', description: 'Improve our tools', startDate: '2026-11-06', team: [{role:'Project Manager',name:'Manager',userId:manager,allocationPercent:0}] });
    const saveInternal = async (record, revision) => db.query('select save_workspace_changes($1::jsonb)', [JSON.stringify([{collection:'projects',id:record.id,operation:'save',expectedRevision:revision,data:serializeRecord('projects',record)}])]);
    await saveInternal(internal, null);
    const internalRow = (await db.query("select * from projects where external_id='INTERNAL-1'")).rows[0];
    assert.equal(internalRow.project_type, 'internal');
    for (const field of ['client_id','lead_id','proposal_id','client_email']) assert.equal(internalRow[field], null);
    assert.equal((await db.query('select count(*)::int n from clients')).rows[0].n, clientsBefore);
    await assert.rejects(db.query("insert into invoices(invoice_number,project_id,issue_date) values('NO-INTERNAL-INVOICE',$1,current_date)", [internalRow.id]), /Internal projects cannot have invoices/);
    await assert.rejects(db.query("insert into managed_projects(source_project_id,project_title,model,billing_cycle,period_start) values($1,'Internal','Annual maintenance','Monthly',current_date)", [internalRow.id]), /Internal projects cannot have invoices or retainer plans/);
    await assert.rejects(db.query("update projects set lead_id=$1 where id=$2",[lead,internalRow.id]), /internal_projects_no_sales/);
    await assert.rejects(saveInternal({...internal,leadId:'KEEP-LEAD'},0), /Internal projects cannot be linked to leads/);
    await assert.rejects(saveInternal({...internal,projectType:'client'},0), /Project type cannot be changed/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager]);
    await db.exec('set role authenticated');
    const task = {id:'INTERNAL-TASK',title:'Build tools',kind:'FEATURE_DEV',assignee:'Manager',assigneeId:manager,priority:'P3',estimatedHours:2,loggedHours:0,status:'TO_DO',createdAt:'2026-11-06T00:00:00Z'};
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [employee]);
    await db.exec('set role authenticated');
    await assert.rejects(saveInternal({...internal,workItems:[task]},0), /Employees can update only/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await saveInternal({...internal,workItems:[task]},0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager]);
    await db.exec('set role authenticated');
    await saveInternal({...internal,status:'ON_TRACK',workItems:[{...task,status:'IN_PROGRESS'}]},1);
    await db.exec('reset role');
    const hydrated = await readRelationalWorkspace({from: table => ({select: () => ({order: () => ({range: async () => ({data:(await db.query(`select * from ${table}`)).rows,error:null})}),limit: async () => ({data:[],error:null})})}),rpc: async () => ({data:1})});
    assert.equal(hydrated.values.projects.find(p => p.id===internal.id).projectType,'internal');
    assert.equal(hydrated.values.projects.find(p => p.id===internal.id).workItems[0].status,'IN_PROGRESS');
    const tables = ['workspace_members', 'leads', 'proposals', 'projects', 'project_team_members', 'project_work_items', 'attendance_sessions'];
    async function snapshot() {
      const result = {};
      for (const table of tables) result[table] = (await db.query(`select * from public.${table} order by id`)).rows;
      return result;
    }
    const before = await snapshot();
    await db.exec(sql);
    assert.deepEqual(await snapshot(), before);
    await db.exec(`alter table leads drop constraint leads_status_check;
      alter table leads add constraint leads_status_check check(status in ('NEW','QUALIFIED','PROPOSAL_SENT','ACCEPTED','CONVERTED','LOST','DISQUALIFIED'));
      update leads set status='QUALIFIED' where external_id='KEEP-LEAD';`);
    await db.exec(sql);
    const updated = (await db.query("select status,qualification,revision from leads where external_id='KEEP-LEAD'")).rows[0];
    assert.equal(updated.status, 'NEW');
    assert.equal(updated.revision, 1);
    assert.equal(updated.qualification.proposalAttachment.name, 'scope.pdf');
    for (const table of tables) assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, before[table].length);
    await assert.rejects(db.query("update leads set status='QUALIFIED' where external_id='KEEP-LEAD'"), /leads_status_check/);
    await db.query("update workspace_members set role='admin' where user_id=$1",[manager]);
    await db.query("update workspace_members set role='employee' where user_id=$1", [manager]);
    const remainingManagers=(await db.query("select * from project_team_members where role='Project Manager'")).rows;
    assert.equal(remainingManagers.length,1);assert.equal(remainingManagers[0].user_id,admin);
  } finally {
    await db.close();
  }
});
