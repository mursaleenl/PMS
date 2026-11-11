const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');const {readDatabaseSection}=require('../scripts/database-sql.cjs');
const raw=fs.readFileSync('supabase/main-database.sql','utf8');const sql=raw.replace('create extension if not exists pgcrypto;','');
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);return db;}
test('migration locks every existing application table before schema changes and has one transaction boundary',()=>{
 assert.equal([...raw.matchAll(/^begin;\s*$/gm)].length,1);assert.equal([...raw.matchAll(/^commit;\s*$/gm)].length,1);
 const guard=readDatabaseSection('migration-locks');assert.ok(raw.indexOf('-- ===== Section: migration-locks')<raw.indexOf('-- ===== Section: foundation'));
 for(const [,name] of raw.matchAll(/create table if not exists public\.(\w+)/g))assert.ok(guard.includes(`'${name}'`),`Missing migration preflight lock for ${name}`);
 assert.match(guard,/order by c.relname/);assert.match(guard,/lock table auth\.users in access exclusive mode nowait/);assert.match(guard,/lock table public\.%I in access exclusive mode nowait/);
});
test('a late migration failure rolls back earlier data changes and DDL, and the whole script can then be rerun',async()=>{
 const db=await setup();try{
  await db.exec(sql);await db.exec("create table public.migration_probe(id integer primary key,value integer);insert into public.migration_probe values(1,7)");
  const broken=sql.replace('-- ===== Section: foundation =====',"update public.migration_probe set value=99;alter table public.migration_probe add column attempted text;\n-- ===== Section: foundation =====").replace('-- ===== Section: project-manager-operational-access =====',()=>"do $$begin raise exception 'Simulated late migration failure';end;$$;\n-- ===== Section: project-manager-operational-access =====");
  await assert.rejects(db.exec(broken),/Simulated late migration failure/);await db.exec('rollback');
  assert.equal((await db.query('select value from public.migration_probe where id=1')).rows[0].value,7);
  assert.equal((await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='migration_probe' and column_name='attempted'")).rows.length,0);
  await db.exec(sql);assert.equal((await db.query('select value from public.migration_probe where id=1')).rows[0].value,7);
 }finally{await db.close();}
});
test('a busy graph writer aborts before foundation changes with a retry message',async()=>{
 const db=await setup();try{
  // PGlite has one backend: simulate the advisory-lock result rather than claiming a concurrency test.
  await db.exec("create function public.pg_try_advisory_xact_lock(bigint) returns boolean language sql as $$select false$$;set search_path=public,pg_catalog;");
  await assert.rejects(db.exec(sql),error=>error.code==='55P03'&&error.message.includes('Workspace is busy'));
  await db.exec('rollback');assert.equal((await db.query("select to_regclass('public.projects') table_name")).rows[0].table_name,null);
 }finally{await db.close();}
});
