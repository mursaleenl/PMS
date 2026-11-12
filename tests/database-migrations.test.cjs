const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');const {prepareMigration}=require('../scripts/create-database-migration.cjs');const {readDatabaseSections}=require('../scripts/database-sql.cjs');
function temporary(){return fs.mkdtempSync(path.join(os.tmpdir(),'pms-migrations-'));}
const sections=[{name:'migration-locks',body:'select 1;'},{name:'foundation',body:"create or replace function public.example_value() returns text language sql as $$select 'base'::text$$;"},{name:'final-override',body:"create or replace function public.example_value() returns text language sql as $$select 'final'::text$$;"}];
test('existing databases require a pulled baseline; migration names cannot escape the directory',()=>{
 const root=temporary();try{assert.throws(()=>prepareMigration({root,sections,name:'sync_workspace'}),/baseline first/);assert.throws(()=>prepareMigration({root,sections,name:'../../escape',fresh:true}),/migration name/);assert.equal(prepareMigration({root,sections,check:true}).initialized,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('early changes replay later overrides, unchanged runs do nothing, and edited migration history is rejected',async()=>{
 const root=temporary(),db=new PGlite();try{
  for(const target of ['main']){const folder=path.join(root,'supabase/environments',target,'supabase/migrations');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,`20270101000000_${target}_baseline.sql`),'-- pulled existing schema');}
  const first=prepareMigration({root,sections,name:'sync_workspace',now:new Date('2026-11-11T10:00:00Z')});assert.match(first.file,/20270101000001_sync_workspace.sql$/);await db.exec(fs.readFileSync(first.file,'utf8'));
  const changed=sections.map(section=>section.name==='foundation'?{...section,body:section.body.replace("'base'","'changed base'")}:section);
  const next=prepareMigration({root,sections:changed,name:'change_base',now:new Date('2026-11-11T10:00:00Z')});assert.deepEqual(next.included,['migration-locks','foundation','final-override']);await db.exec(fs.readFileSync(next.file,'utf8'));assert.equal((await db.query('select example_value() value')).rows[0].value,'final');
  assert.equal(prepareMigration({root,sections:changed,name:'no_change'}).file,null);assert.deepEqual(prepareMigration({root,sections:changed,check:true}).changed,[]);
  const later=changed.map(section=>section.name==='final-override'?{...section,body:section.body.replace("'final'","'latest'")}:section);
  assert.deepEqual(prepareMigration({root,sections:later,check:true}).changed,['final-override']);const latest=prepareMigration({root,sections:later,name:'new_final'});assert.deepEqual(latest.included,['migration-locks','final-override']);await db.exec(fs.readFileSync(latest.file,'utf8'));assert.equal((await db.query('select example_value() value')).rows[0].value,'latest');
  assert.throws(()=>prepareMigration({root,sections:later.slice(0,-1),name:'removed'}),/removed or renamed/);
  assert.throws(()=>prepareMigration({root,sections:[later[0],later[2],later[1]],name:'reordered'}),/reordered/);
  const added=[{...later[0],body:'select 2;'},...later.slice(1),{name:'new-feature',body:'create table public.new_feature(id integer);'}];
  const addition=prepareMigration({root,sections:added,name:'add_feature'});assert.deepEqual(addition.included,['migration-locks','new-feature']);
  fs.appendFileSync(next.file,'\n-- edited history');assert.throws(()=>prepareMigration({root,sections:added,check:true}),/Previously generated migration changed/);
 }finally{await db.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('a generated canonical baseline installs the complete workspace in a fresh Supabase-shaped database',async()=>{
 const root=temporary(),db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
  const result=prepareMigration({root,sections:readDatabaseSections(),name:'initial_workspace',fresh:true});const sql=fs.readFileSync(result.file,'utf8').replace('create extension if not exists pgcrypto;','');
  assert.doesNotMatch(sql,/^(begin|commit);\s*$/gm);await db.exec('begin;\n'+sql+'\ncommit;');
  for(const name of ['projects','qa_reports','general_tasks','workspace_reviews'])assert.equal((await db.query('select to_regclass($1) name',[`public.${name}`])).rows[0].name,name);
  assert.ok((await db.query("select pg_get_functiondef('public.can_manage_workspace()'::regprocedure) definition")).rows[0].definition.includes('project_manager'));
 }finally{await db.close();fs.rmSync(root,{recursive:true,force:true});}
});
