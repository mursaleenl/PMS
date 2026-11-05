const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('client records isolate accounts, hide drafts, and reject other roles',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
 await db.exec(fs.readFileSync('supabase/main-database.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 const ids=['00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000033'];
 for(const [index,id] of ids.entries()){
  await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${index}@example.com`]);
  await db.query('insert into workspace_members(user_id,email,role) values($1,$2,$3)',[id,`${index}@example.com`,index===2?'employee':'client']);
 }
 for(const [index,id] of ids.slice(0,2).entries()){
  const account=(await db.query("insert into clients(company_name,client_user_id) values($1,$2) returning id",[`Company ${index}`,id])).rows[0].id;
  const lead=(await db.query("insert into leads(full_name,email,client_id,status,acceptance_document_name,acceptance_document_data_url) values('Client',$1,$2,'ACCEPTED','signed.pdf','data:application/pdf;base64,JVBERg==') returning id",[`${index}@example.com`,account])).rows[0].id;
  for(const status of ['DRAFT','SENT'])await db.query("insert into proposals(lead_id,client_id,proposal_title,status,version,share_token,document_name,document_data_url) values($1,$2,$3,$4,case when $4='DRAFT' then 1 else 2 end,$5,'scope.pdf','data:application/pdf;base64,JVBERg==')",[lead,account,`Proposal ${index}`,status,`proposal-${index}-${status}-token-123456789`]);
  for(const status of ['GENERATED','SENT'])await db.query("insert into invoices(invoice_number,client_id,status) values($1,$2,$3)",[`${index}-${status}`,account,status]);
 }
 await db.exec('grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;set role authenticated');
 for(const [index,id] of ids.slice(0,2).entries()){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const data=(await db.query('select read_client_records() result')).rows[0].result;
  assert.equal(data.proposals.length,1);assert.equal(data.proposals[0].title,`Proposal ${index}`);
  assert.equal(data.invoices.length,1);assert.equal(data.invoices[0].number,`${index}-SENT`);
  assert.equal(data.documents.length,2);
  assert.equal(data.proposals[0].review_path,`/proposal/proposal-${index}-SENT-token-123456789`);
  assert.equal(data.proposals[0].share_token,undefined);assert.equal(data.invoices[0].client_id,undefined);
 }
 // The portal's review link leads to the existing acceptance workflow.
 await db.exec('reset role');
 await db.query("select respond_shared_proposal($1,'ACCEPTED','Client Approver','')",['proposal-0-SENT-token-123456789']);
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[0]]);
 const accepted=(await db.query('select read_client_records() result')).rows[0].result;
 assert.equal(accepted.proposals[0].status,'ACCEPTED');
 assert.equal(accepted.proposals[0].accepted_by,'Client Approver');
 assert.ok(accepted.proposals[0].accepted_at);
 await db.exec('reset role');
 const lead=(await db.query("select status,acceptance_name from leads where email='0@example.com'")).rows[0];
 assert.equal(lead.status,'ACCEPTED');assert.equal(lead.acceptance_name,'Client Approver');
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[2]]);
 await assert.rejects(db.query('select read_client_records()'),/Client access required/);
 await db.query("select set_config('request.jwt.claim.sub','',false)");
 await assert.rejects(db.query('select read_client_records()'),/Client access required/);
 }finally{await db.close();}
});
