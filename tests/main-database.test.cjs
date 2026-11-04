const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const admin = '00000000-0000-0000-0000-000000000001';
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
    const lead = (await db.query("insert into leads(external_id,full_name,email,status,qualification) values('KEEP-LEAD','Client','client@example.com','NEW','{\"proposalAttachment\":{\"name\":\"scope.pdf\",\"dataUrl\":\"data:application/pdf;base64,JVBERg==\"}}') returning id")).rows[0].id;
    const project = (await db.query("insert into projects(external_id,lead_id,title,status) values('KEEP-PROJECT',$1,'Keep this project','ON_TRACK') returning id", [lead])).rows[0].id;
    await db.query("insert into proposals(lead_id,proposal_title,share_token,status,quoted_amount) values($1,'Keep this proposal','keep-public-token','SENT',1200)", [lead]);
    await db.query("insert into project_team_members(project_id,user_id,role,name) values($1,$2,'Project Manager','Admin')", [project, admin]);
    await db.query("insert into project_work_items(project_id,external_id,title,kind,assignee_user_id,assignee_name) values($1,'KEEP-TASK','Keep this task','FEATURE_DEV',$2,'Employee')", [project, employee]);
    await db.query("insert into attendance_sessions(user_id,work_date,checked_in_at,checked_out_at,checkin_token,checkout_token) values($1,'2026-11-03','2026-11-03T08:00:00Z','2026-11-03T10:00:00Z',gen_random_uuid(),gen_random_uuid())", [employee]);
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
  } finally {
    await db.close();
  }
});
