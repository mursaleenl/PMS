const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PGlite } = require('@electric-sql/pglite');

test('complete testing SQL installs atomically in a fresh Supabase-shaped database', async () => {
  execFileSync(process.execPath, ['scripts/build-testing-database.cjs', '--check'], { cwd: path.resolve(__dirname, '..') });
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
    // PGlite has gen_random_uuid built in but does not package pgcrypto.
    const sql = fs.readFileSync('supabase/testing-database.sql', 'utf8').replace('create extension if not exists pgcrypto;', '');
    await db.exec(sql);
    for (const table of ['workspace_members', 'projects', 'project_team_members', 'workspace_mutations', 'workspace_reviews', 'attendance_sessions', 'attendance_audit', 'workspace_notifications']) {
      assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
    }
    assert.equal((await db.query('select count(*)::int n from public.workspace_members')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from public.projects')).rows[0].n, 0);
    assert.ok((await db.query("select pg_get_functiondef('public.read_client_projects()'::regprocedure) definition")).rows[0].definition.includes('tasks'));
    assert.ok((await db.query("select 1 from pg_trigger where tgname='project_status_after_task_assignment'")).rows.length);
    for (const status of ['NEW', 'PROPOSAL_SENT', 'ACCEPTED', 'CONVERTED', 'LOST']) {
      await db.query('insert into public.leads(external_id,full_name,email,status) values($1,$2,$3,$4)', [`TEST-${status}`, 'Test contact', 'test@example.com', status]);
    }
    for (const status of ['QUALIFIED', 'DISQUALIFIED']) {
      await assert.rejects(db.query('insert into public.leads(full_name,email,status) values($1,$2,$3)', ['Test contact', 'test@example.com', status]), /leads_status_check/);
    }
    await assert.rejects(db.exec(sql), /requires a fresh public schema/);
    await db.exec('rollback');
  } finally {
    await db.close();
  }
});
