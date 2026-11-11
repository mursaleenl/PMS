const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {readDatabaseSection}=require('../scripts/database-sql.cjs');
const {createLoader}=require('../scripts/test-loader.cjs');
const load=createLoader({'@/lib/assignees':{DUMMY_ASSIGNABLE_NAMES:new Set()}});
const {serializeRecord}=load('lib/relational-sync.ts');

test('multiple independent projects persist under the same client and appear in its portal',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`);
  await db.exec(readDatabaseSection('foundation').replace('create extension if not exists pgcrypto;',''));
  await db.exec(readDatabaseSection('workspace-reliability'));
  await db.exec(readDatabaseSection('client-project-tasks'));
  const admin='00000000-0000-0000-0000-000000000001',client='00000000-0000-0000-0000-000000000003';
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'admin@example.com',now()),($2,'client@example.com',now())",[admin,client]);
  await db.query("insert into workspace_members(user_id,email,role) values($1,'admin@example.com','admin'),($2,'client@example.com','client')",[admin,client]);
  const identity=async(id,email)=>db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({email})]);
  await identity(admin,'admin@example.com');
  let counter=0;
  const {createClientProject}=createLoader({'@/lib/numbering':{reserveWorkspaceNumber:async()=>`EVE-MULTI-${++counter}`}})('lib/client-projects.ts');
  const input={client:{name:'Client',companyName:'Client Co',email:'client@example.com',contactDetails:{phone:'+91 1234567890',country:'India'}},description:'Independent scope',services:['Website'],startDate:'2026-11-11',operatingCompany:'Evecture',billingStructure:'Fixed',currency:'USD',team:[]};
  const first=await createClientProject({...input,title:'Website',contractedValue:1000});
  const second=await createClientProject({...input,title:'Mobile app',contractedValue:5000});
  const changes=[first,second].map(row=>({collection:'projects',id:row.id,expectedRevision:null,operation:'save',data:serializeRecord('projects',row)}));
  await db.query('select save_workspace_changes($1::jsonb)',[JSON.stringify(changes)]);
  const rows=(await db.query('select client_id,proposal_id,title,contracted_value,enquiry_details from projects order by external_id')).rows;
  assert.equal(rows.length,2);assert.ok(rows[0].client_id);assert.equal(rows[0].client_id,rows[1].client_id);
  assert.equal(rows[0].enquiry_details.phone,'+91 1234567890');assert.equal(rows[1].enquiry_details.country,'India');
  second.enquiryDetails={...second.enquiryDetails,phone:'+91 9999999999',description:'Updated goals',budgetNote:'Confirmed'};
  await db.query('select save_workspace_changes($1::jsonb)',[JSON.stringify([{collection:'projects',id:second.id,expectedRevision:0,operation:'save',data:serializeRecord('projects',second)}])]);
  const details=(await db.query('select title,enquiry_details from projects order by external_id')).rows;
  assert.equal(details[0].enquiry_details.phone,'+91 1234567890');assert.equal(details[1].enquiry_details.phone,'+91 9999999999');assert.equal(details[1].enquiry_details.description,'Updated goals');
  assert.equal(rows[0].proposal_id,null);assert.equal(Number(rows[0].contracted_value),1000);assert.equal(Number(rows[1].contracted_value),5000);
  assert.equal((await db.query('select count(*)::int total from invoices')).rows[0].total,0);
  await identity(client,'client@example.com');await db.exec('set role authenticated');
  const visible=(await db.query('select read_client_projects() result')).rows[0].result;
  assert.deepEqual(visible.map(row=>row.title).sort(),['Mobile app','Website']);
 }finally{await db.close();}
});

test('legacy enquiry details fill missing project fields while explicit edits and cleared values are retained',()=>{
 const {getProjectEnquiryDetails}=load('lib/projects.ts');
 const result=getProjectEnquiryDetails({enquiryDetails:{phone:'',country:'India',designation:undefined}},{phone:'old phone',country:'USA',designation:'Founder'});
 assert.equal(result.phone,'');assert.equal(result.country,'India');assert.equal(result.designation,'Founder');
});
