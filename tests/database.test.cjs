const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readDatabaseSection}=require('../scripts/database-sql.cjs');
const {PGlite}=require('@electric-sql/pglite');
const {createLoader}=require('../scripts/test-loader.cjs');
const load=createLoader({'@/lib/assignees':{DUMMY_ASSIGNABLE_NAMES:new Set()}});
const {serializeRecord,readRelationalWorkspace}=load('lib/relational-sync.ts');
const ADMIN='00000000-0000-0000-0000-000000000001';
const EMPLOYEE='00000000-0000-0000-0000-000000000002';
const CLIENT='00000000-0000-0000-0000-000000000003';
const OUTSIDER='00000000-0000-0000-0000-000000000004';
let db;
async function setup() {
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth to authenticated;
 grant execute on function auth.uid(),auth.jwt() to authenticated;
 `);
 await db.exec(readDatabaseSection('foundation').replace('create extension if not exists pgcrypto;',''));
 await db.exec(readDatabaseSection('workspace-reliability'));
 await db.exec(readDatabaseSection('general-tasks'));
 for(const [id,email] of [[ADMIN,'admin@example.com'],[EMPLOYEE,'employee@example.com'],[CLIENT,'client@example.com'],[OUTSIDER,'outsider@example.com']]) await db.query(`insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())`,[id,email]);
 await db.query(`insert into public.workspace_members(user_id,email,role) values($1,'admin@example.com','admin'),($2,'employee@example.com','employee'),($3,'client@example.com','client')`,[ADMIN,EMPLOYEE,CLIENT]);
 await identity(ADMIN,'admin@example.com');
}
async function identity(id,email) {await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,[id,JSON.stringify({email})]);}
async function save(changes) {return (await db.query('select public.save_workspace_changes($1::jsonb) result',[JSON.stringify(changes)])).rows[0].result;}
function lead(id,overrides={}) {return {id,fullName:'Client',companyName:'Client Co',email:'client@example.com',services:[],urgency:'Standard',status:'NEW',createdAt:'2026-10-29T00:00:00Z',...overrides};}
function project(id,leadId,overrides={}) {return {id,leadId,title:'Delivery',clientCompany:'Client Co',clientName:'Client',clientEmail:'client@example.com',classification:'New Client',billingStructure:'Fixed',contractedValue:1000,currency:'USD',revisionRounds:2,status:'ACTIVE',createdAt:'2026-10-29T00:00:00Z',team:[],workItems:[],...overrides};}
function change(collection,row,revision=null) {return {collection,id:row.id,expectedRevision:revision,operation:'save',data:serializeRecord(collection,row)};}

test('workspace database migrations and transactional workflows',async t=>{
 await setup();
 await t.test('enquiries persist without email or phone and do not fabricate contact details',async()=>{
   await save([change('leads',lead('OPTIONAL-CONTACT',{companyName:'No Contact Company',email:'',phone:''}))]);
   const {rows}=await db.query("select email,phone from public.leads where external_id='OPTIONAL-CONTACT'");
   assert.equal(rows[0].email,'');assert.equal(rows[0].phone,null);
 });
 await t.test('migration is rerunnable',async()=>{await db.exec(readDatabaseSection('workspace-reliability'));});
 await t.test('retired lead stages migrate once and cannot be saved again',async()=>{
   const attachment={name:'scope.pdf',dataUrl:'data:application/pdf;base64,JVBERg=='};
   await save([change('leads',lead('LEGACY-READY',{qualification:{proposalAttachment:attachment}})),change('leads',lead('LEGACY-CLOSED'))]);
   await db.exec(`alter table public.leads drop constraint leads_status_check;
    alter table public.leads add constraint leads_status_check check(status in ('NEW','QUALIFIED','PROPOSAL_SENT','ACCEPTED','CONVERTED','LOST','DISQUALIFIED'));
    update public.leads set status='QUALIFIED' where external_id='LEGACY-READY';
    update public.leads set status='DISQUALIFIED' where external_id='LEGACY-CLOSED';`);
   const migration=readDatabaseSection('remove-lead-qualification');
   await db.exec(migration);
   const first=(await db.query("select external_id,status,revision,qualification from public.leads where external_id like 'LEGACY-%' order by external_id")).rows;
   assert.deepEqual(first.map(row=>row.status),['LOST','NEW']);
   assert.deepEqual(first[1].qualification.proposalAttachment,attachment);
   await db.exec(migration);
   assert.deepEqual((await db.query("select external_id,status,revision,qualification from public.leads where external_id like 'LEGACY-%' order by external_id")).rows,first);
   for(const status of ['QUALIFIED','DISQUALIFIED']) await assert.rejects(db.query("update public.leads set status=$1 where external_id='LEGACY-READY'",[status]),/leads_status_check/);
 });
 await t.test('missing membership and client roles cannot write',async()=>{
   for(const [id,email] of [[OUTSIDER,'outsider@example.com'],[CLIENT,'client@example.com']]) {
     await identity(id,email);
     await assert.rejects(save([change('leads',lead('FORBIDDEN'))]),/membership required/);
   }
   await identity(OUTSIDER,'outsider@example.com');
   assert.equal((await db.query('select public.current_workspace_role() role')).rows[0].role,null);
   assert.equal((await db.query('select public.is_workspace_admin() value')).rows[0].value,false);
   await assert.rejects(db.query("select public.set_workspace_member_role('outsider@example.com','admin',null)"),/Only administrators/);
   await assert.rejects(db.query('select public.claim_initial_admin()'),/server administrator endpoint/);
   await identity(ADMIN,'admin@example.com');
 });
 await t.test('stale saves are rejected and unrelated rows survive',async()=>{
   await save([change('leads',lead('L1')),change('leads',lead('L2'))]);
   await save([change('leads',lead('L1',{fullName:'Newer name'}),0)]);
   await assert.rejects(save([change('leads',lead('L1',{fullName:'Stale name'}),0)]),/CONFLICT/);
   assert.equal((await db.query("select count(*)::int total from leads where external_id='L2'")).rows[0].total,1);
 });
 await t.test('invalid child data rolls back the full batch',async()=>{
   const invalid=project('BAD','L2',{workItems:[{id:'task',title:'Task',kind:'INVALID',status:'TO_DO'}]});
   await assert.rejects(save([change('leads',lead('ROLLBACK')),change('projects',invalid)]));
   assert.equal((await db.query("select count(*)::int total from leads where external_id='ROLLBACK'")).rows[0].total,0);
   assert.equal((await db.query("select count(*)::int total from projects where external_id='BAD'")).rows[0].total,0);
 });
 const proposal={version:1,status:'SENT',shareToken:'12345678-1234-1234-1234-123456789012',createdAt:'2026-10-29T00:00:00Z',expiryDate:'2099-12-31',quotedAmount:1000,depositPercent:20,billingStructure:'Fixed',revisionRounds:2,followUps:[],changeRequest:'Keep these notes'};
 await t.test('proposal and task IDs remain stable through edits',async()=>{
   await save([change('leads',lead('L3',{proposals:[proposal]}))]);
   const p=project('P1','L3',{proposalVersion:1,workItems:[{id:'TASK1',title:'Build',kind:'FEATURE_DEV',status:'TO_DO',priority:'P3',estimatedHours:4,loggedHours:0,createdAt:'2026-10-29T00:00:00Z'}]});
   await save([change('projects',p)]);
   const before=(await db.query('select id from proposals where share_token=$1',[proposal.shareToken])).rows[0].id;
   const taskBefore=(await db.query("select id from project_work_items where external_id='TASK1'")).rows[0].id;
   await save([change('leads',lead('L3',{fullName:'Updated',proposals:[proposal]}),0),change('projects',{...p,title:'Updated delivery'},0)]);
   assert.equal((await db.query('select id from proposals where share_token=$1',[proposal.shareToken])).rows[0].id,before);
   assert.equal((await db.query("select proposal_id from projects where external_id='P1'")).rows[0].proposal_id,before);
   assert.equal((await db.query("select id from project_work_items where external_id='TASK1'")).rows[0].id,taskBefore);
 });
 await t.test('shared responses persist atomically and reject repeated acceptance',async()=>{
   const shared=(await db.query('select public.read_shared_proposal($1) value',[proposal.shareToken])).rows[0].value;
   assert.equal(shared.lead.email,null);
   assert.equal(shared.proposal.response_note,'Keep these notes');
   await db.query("select public.respond_shared_proposal($1,'ACCEPTED','Approver','')",[proposal.shareToken]);
   await assert.rejects(db.query("select public.respond_shared_proposal($1,'DECLINED','','Changed mind')",[proposal.shareToken]),/no longer open/);
   assert.equal((await db.query("select status from leads where external_id='L3'")).rows[0].status,'ACCEPTED');
   await assert.rejects(save([change('leads',lead('L3',{proposals:[proposal]}),1)]),/CONFLICT/);
 });
 await t.test('expired proposals cannot be accepted',async()=>{
   const expired={...proposal,shareToken:'expired-proposal-token',expiryDate:'2000-01-01'};
   await save([change('leads',lead('EXPIRED',{proposals:[expired]}))]);
   await assert.rejects(db.query("select public.respond_shared_proposal($1,'ACCEPTED','Approver','')",[expired.shareToken]),/expired/);
 });
 await t.test('number reservations are unique and respect existing numbers',async()=>{
   await save([change('projects',project(`EVE-${new Date().getFullYear()}-099`,'L2'))]);
   const numbers=[];
   for(let i=0;i<10;i++)numbers.push((await db.query("select reserve_workspace_number('project','Evecture') number")).rows[0].number);
   assert.equal(new Set(numbers).size,10);
   assert.ok(numbers[0].endsWith('-100'));
 });
 await t.test('client account linkage and row policies isolate projects',async()=>{
   const own=(await db.query("select client_id from projects where external_id='P1'")).rows[0].client_id;
   assert.equal((await db.query('select client_user_id from clients where id=$1',[own])).rows[0].client_user_id,CLIENT);
   await save([change('leads',lead('OTHER',{email:'other@example.com',companyName:'Other'})),change('projects',project('PRIVATE','OTHER',{clientEmail:'other@example.com',clientCompany:'Other'}))]);
   await identity(CLIENT,'client@example.com');await db.exec('set role authenticated');
   const rows=await db.query('select external_id from projects');
   assert.ok(rows.rows.some(row=>row.external_id==='P1'));
   assert.ok(!rows.rows.some(row=>row.external_id==='PRIVATE'));
   await assert.rejects(db.query("update projects set title='Tampered'"),/permission denied/);
   await db.exec('reset role');await identity(ADMIN,'admin@example.com');
 });
 await t.test('retrying an acknowledged request is idempotent',async()=>{
   const changes=[change('leads',lead('IDEMPOTENT'))];
   const requestId='99999999-0000-0000-0000-000000000001';
   const first=(await db.query('select public.save_workspace_changes($1::jsonb,$2::uuid) result',[JSON.stringify(changes),requestId])).rows[0].result;
   const repeated=(await db.query('select public.save_workspace_changes($1::jsonb,$2::uuid) result',[JSON.stringify(changes),requestId])).rows[0].result;
   assert.deepEqual(repeated,first);
   assert.equal((await db.query("select revision from leads where external_id='IDEMPOTENT'")).rows[0].revision,0);
 });
 await t.test('invoice totals are checked and unrelated invoices preserve the deposit',async()=>{
   const invoice={id:'TEST-INVOICE-1',invoiceNumber:'TEST-INVOICE-1',leadId:'L3',projectId:'P1',operatingCompany:'Evecture',billTo:'Client',description:'Milestone',quantity:1,unitPrice:100,subtotal:100,gstEnabled:true,gstRate:18,gstAmount:18,total:118,issueDate:'2026-10-01',dueDate:'2026-10-10',contractValue:1000,depositPercent:0,depositAmount:0,currency:'USD',status:'GENERATED',createdAt:'2026-10-01T00:00:00Z'};
   await save([change('invoices',invoice)]);
   await assert.rejects(save([change('invoices',{...invoice,total:1},0)]),/Invalid invoice/);
   assert.equal((await db.query("select total from invoices where invoice_number='TEST-INVOICE-1'")).rows[0].total,'118.00');
 });
 await t.test('clients cannot impersonate senders or message other projects',async()=>{
   await identity(CLIENT,'client@example.com');await db.exec('set role authenticated');
   const own=(await db.query("select id from projects where external_id='P1'")).rows[0].id;
   await db.query('insert into project_messages(project_id,sender_id,sender_name,body) values($1,$2,$3,$4)',[own,CLIENT,'Client','Hello team']);
   await assert.rejects(db.query('insert into project_messages(project_id,sender_id,sender_name,body) values($1,$2,$3,$4)',[own,ADMIN,'Admin','Spoofed']),/row-level security/);
   await assert.rejects(db.query("select public.read_shared_proposal('token')"),/permission denied/);
   await assert.rejects(db.query("insert into attendance_records(user_id,work_date,status) values($1,current_date,'PRESENT')",[CLIENT]),/row-level security/);
   await db.exec('reset role');await identity(ADMIN,'admin@example.com');
 });
 await t.test('optional proposal attachments persist without creating a generated proposal',async()=>{
   const attachment={name:'proposal.pdf',dataUrl:'data:application/pdf;base64,JVBERi0='};
   await save([change('leads',lead('OPTIONAL-UPLOAD',{status:'NEW',qualification:{proposalAttachment:attachment}})),change('projects',project('WITHOUT-PROPOSAL','OPTIONAL-UPLOAD',{proposalVersion:0}))]);
   assert.deepEqual((await db.query("select qualification from leads where external_id='OPTIONAL-UPLOAD'")).rows[0].qualification.proposalAttachment,attachment);
   assert.equal((await db.query("select proposal_id from projects where external_id='WITHOUT-PROPOSAL'")).rows[0].proposal_id,null);
   assert.equal((await db.query("select count(*)::int n from proposals p join leads l on l.id=p.lead_id where l.external_id='OPTIONAL-UPLOAD'")).rows[0].n,0);
 });
 await t.test('the final administrator cannot be demoted through direct RPC',async()=>{
   await assert.rejects(db.query("select public.set_workspace_member_role('admin@example.com','employee',null)"),/at least one administrator/);
   assert.equal((await db.query("select role from workspace_members where user_id=$1",[ADMIN])).rows[0].role,'admin');
 });
 await t.test('employee migrations isolate assignments and preserve client access without policy recursion',async()=>{
   for(const file of ['employee-role-access','employee-client-rls-fix','reviews']) {
     await db.exec(readDatabaseSection(file));
     await db.exec(readDatabaseSection(file));
   }
   await db.query("update project_work_items set assignee_user_id=$1 where external_id='TASK1'",[EMPLOYEE]);
   const privateProject=(await db.query("select id from projects where external_id='PRIVATE'")).rows[0].id;
   await db.query("insert into project_messages(project_id,sender_id,sender_name,body) values($1,$2,'Admin','Private project message')",[privateProject,ADMIN]);
   await db.query("update projects set status='COMPLETED' where external_id='P1'");
   await db.query("insert into project_team_members(project_id,user_id,role,name,allocation_percent) select id,$1,'Project Manager','Admin Manager',0 from projects where external_id='P1'",[ADMIN]);
   await identity(EMPLOYEE,'employee@example.com');await db.exec('set role authenticated');
   assert.deepEqual((await db.query('select external_id from projects')).rows.map(r=>r.external_id),['P1']);
   assert.equal((await db.query('select count(*)::int n from project_work_items')).rows[0].n,1);
   assert.equal((await db.query('select count(*)::int n from clients')).rows[0].n,1);
   for(const table of ['leads','proposals','invoices']) assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
   const reader={from:table=>({select:columns=>({
     order:()=>({range:async()=>({data:JSON.parse(JSON.stringify((await db.query(`select * from public.${table} order by id`)).rows)),error:null})}),
     limit:async()=>({data:(await db.query(`select ${columns} from public.${table} limit 1`)).rows,error:null})
   })}),rpc:async()=>({data:1,error:null})};
   const snapshot=await readRelationalWorkspace(reader);
   const assigned=snapshot.values.projects.find(p=>p.id==='P1');
   const changed={...assigned,workItems:assigned.workItems.map(task=>({...task,status:'UNDER_REVIEW'}))};
   await save([change('projects',changed,snapshot.revisions['projects:P1'])]);
   assert.equal((await db.query("select status from project_work_items where external_id='TASK1'")).rows[0].status,'UNDER_REVIEW');
   assert.equal((await db.query("select status from projects where external_id='P1'")).rows[0].status,'COMPLETED');
   await assert.rejects(save([change('projects',{...changed,title:'Unauthorized rename'},snapshot.revisions['projects:P1']+1)]),/own assigned task progress/);
   await assert.rejects(save([change('projects',{...changed,status:'ACTIVE'},snapshot.revisions['projects:P1']+1)]),/own assigned task progress/);
   const managerChange={...changed,team:changed.team.map(member=>member.role==='Project Manager'?{...member,name:'Employee Manager',userId:EMPLOYEE}:member)};
   await assert.rejects(save([change('projects',managerChange,snapshot.revisions['projects:P1']+1)]),/own assigned task progress/);
   assert.equal((await db.query("select user_id from project_team_members where role='Project Manager' and project_id=(select id from projects where external_id='P1')")).rows[0].user_id,ADMIN);
   await assert.rejects(db.query("update project_team_members set user_id=$1 where role='Project Manager'",[EMPLOYEE]),/permission denied/);
   const own=(await db.query("select id from projects where external_id='P1'")).rows[0].id;
   await db.query('insert into project_messages(project_id,sender_id,sender_name,body) values($1,$2,$3,$4)',[own,EMPLOYEE,'Employee','Assigned project message']);
   assert.ok(!(await db.query('select body from project_messages')).rows.some(r=>r.body==='Private project message'));
   await assert.rejects(db.query("insert into project_messages(project_id,sender_id,sender_name,body) values($1,$2,'Employee','Unauthorized message')",[privateProject,EMPLOYEE]),/row-level security/);
   await db.exec('reset role');await identity(CLIENT,'client@example.com');await db.exec('set role authenticated');
   assert.ok((await db.query('select external_id from projects')).rows.some(r=>r.external_id==='P1'));
   assert.ok(!(await db.query('select external_id from projects')).rows.some(r=>r.external_id==='PRIVATE'));
   await db.query('select * from project_work_items');
   await assert.rejects(save([change('projects',managerChange,snapshot.revisions['projects:P1']+1)]),/membership required/);
   await db.exec('reset role');await identity(ADMIN,'admin@example.com');
 });
 await t.test('reviews prevent employee resolution and isolate reports',async()=>{
   await identity(EMPLOYEE,'employee@example.com');await db.exec('set role authenticated');
   const report=(await db.query(`insert into workspace_reviews(reporter_user_id,reporter_name,title,report_type,description,status,admin_note)
     values($1,'Spoofed','Broken navigation','BUG','The navigation does not open','RESOLVED','Forged admin note') returning *`,[ADMIN])).rows[0];
   assert.equal(report.reporter_user_id,EMPLOYEE);
   assert.equal(report.status,'OPEN');assert.equal(report.admin_note,null);
   await db.query("update workspace_reviews set status='RESOLVED' where id=$1",[report.id]);
   assert.equal((await db.query('select status from workspace_reviews where id=$1',[report.id])).rows[0].status,'OPEN');
   await db.exec('reset role');await identity(CLIENT,'client@example.com');await db.exec('set role authenticated');
   assert.equal((await db.query('select count(*)::int n from workspace_reviews')).rows[0].n,0);
   await db.exec('reset role');await identity(ADMIN,'admin@example.com');await db.exec('set role authenticated');
   await db.query("update workspace_reviews set status='RESOLVED',admin_note='Fixed' where id=$1",[report.id]);
   assert.equal((await db.query('select status from workspace_reviews where id=$1',[report.id])).rows[0].status,'RESOLVED');
   await db.exec('reset role');await identity(ADMIN,'admin@example.com');
 });
 await t.test('client portal exposes associated progress and team only, without direct internal reads',async()=>{
   await db.query("update project_work_items set assignee_name='Assigned employee' where external_id='TASK1'");
   await db.query("update projects set client_company='ZeroGrid LLC' where external_id='P1'");
   const sql=readDatabaseSection('client-portal-access');
   await db.exec(sql);await db.exec(sql);
   await identity(CLIENT,'client@example.com');await db.exec('set role authenticated');
   const projects=(await db.query('select read_client_projects() result')).rows[0].result;
   const own=projects.find(p=>p.external_id==='P1');
   assert.ok(own);assert.ok(!projects.some(p=>p.external_id==='PRIVATE'));
   assert.equal(own.total_tasks,1);
   assert.equal(own.client_company,'ZeroGrid LLC');
   assert.deepEqual(Object.keys(own.details).sort(),['services','start_date','scope_included','scope_excluded','assumptions'].sort());
   assert.equal(own.team,undefined);
   assert.equal(own.details.operating_company,undefined);
   assert.deepEqual(Object.keys(own).sort(),['id','external_id','title','logo_data_url','client_company','details','status','total_tasks','completed_tasks'].sort());
   for(const table of ['clients','projects','project_work_items','project_links','proposals','invoices','project_messages','project_team_members']) {
     assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,table);
   }
   await db.exec('reset role');await identity(EMPLOYEE,'employee@example.com');await db.exec('set role authenticated');
   await assert.rejects(db.query('select read_client_projects()'),/Client access required/);
   assert.equal((await db.query('select count(*)::int n from projects')).rows[0].n,1);
   await db.exec('reset role');await identity(ADMIN,'admin@example.com');
 });
 await t.test('project status migration is rerunnable and On track persists',async()=>{
   const sql=readDatabaseSection('project-status');
   await db.exec(sql);await db.exec(sql);
   const tracked=project('STATUS-FLOW','L2',{status:'ON_TRACK'});
   await save([change('projects',tracked)]);
   assert.equal((await db.query("select status from projects where external_id='STATUS-FLOW'")).rows[0].status,'ON_TRACK');
   await save([change('projects',{...tracked,status:'AMC'},0)]);
   assert.equal((await db.query("select status from projects where external_id='STATUS-FLOW'")).rows[0].status,'AMC');
   await save([change('projects',{...tracked,status:'COMPLETED'},1)]);
   assert.equal((await db.query("select status from projects where external_id='STATUS-FLOW'")).rows[0].status,'COMPLETED');
 });
 await t.test('task assignments move only Active projects to On track',async()=>{
   const work={id:'TRACK-TASK',title:'Assigned task',kind:'FEATURE_DEV',status:'TO_DO',priority:'P3',assignee:'Employee',assigneeId:EMPLOYEE,createdAt:'2026-10-31T00:00:00Z'};
   await save([change('projects',project('TRACK-EXISTING','L2',{workItems:[work]}))]);
   const sql=readDatabaseSection('project-assignment-status');
   await db.exec(sql);await db.exec(sql);
   const existing=(await db.query("select status,revision from projects where external_id='TRACK-EXISTING'")).rows[0];
   assert.equal(existing.status,'ON_TRACK');assert.equal(existing.revision,1);
   for(const status of ['ACTIVE','COMPLETED','AMC']) {
     const id=`ASSIGN-${status}`;
     await save([change('projects',project(id,'L2',{status,workItems:[work]}))]);
     assert.equal((await db.query('select status from projects where external_id=$1',[id])).rows[0].status,status==='ACTIVE'?'ON_TRACK':status);
   }
   await save([change('projects',project('UNASSIGNED','L2',{workItems:[{...work,assignee:'',assigneeId:undefined}]}))]);
   assert.equal((await db.query("select status from projects where external_id='UNASSIGNED'")).rows[0].status,'ACTIVE');
 });
 await t.test('notifications target recipients and audit is restricted',async()=>{
   const sql=readDatabaseSection('activity-notifications');
   await db.exec(sql);await db.exec(sql);
   await identity(ADMIN,'admin@example.com');
   await save([change('leads',lead('NOTICE'))]);
   assert.deepEqual((await db.query("select recipient_id from workspace_notifications where type='LEAD'")).rows.map(r=>r.recipient_id),[ADMIN]);
   const work={id:'NOTICE-TASK',title:'Assigned task',kind:'FEATURE_DEV',status:'TO_DO',priority:'P3',assignee:'Employee',assigneeId:EMPLOYEE,createdAt:'2026-10-31T00:00:00Z'};
   await save([change('projects',project('NOTICE-PROJECT','NOTICE',{workItems:[work]}))]);
   assert.deepEqual((await db.query("select recipient_id from workspace_notifications where type='TASK'")).rows.map(r=>r.recipient_id),[EMPLOYEE]);
   await db.query("update projects set status='COMPLETED' where external_id='NOTICE-PROJECT'");
   assert.deepEqual((await db.query("select distinct recipient_id from workspace_notifications where type='PROJECT'")).rows.map(r=>r.recipient_id).sort(),[EMPLOYEE,CLIENT].sort());
   const count=(await db.query('select count(*)::int n from workspace_notifications')).rows[0].n;
   await db.query("update projects set title='Renamed' where external_id='NOTICE-PROJECT'");
   assert.equal((await db.query('select count(*)::int n from workspace_notifications')).rows[0].n,count);
   await identity(EMPLOYEE,'employee@example.com');await db.exec('set role authenticated');
   assert.ok((await db.query('select * from workspace_notifications')).rows.every(r=>r.recipient_id===EMPLOYEE));
   assert.equal((await db.query('select * from audit_events')).rows.length,0);
   await assert.rejects(db.query("insert into audit_events(entity_type,action) values('fake','INSERT')"));
   await assert.rejects(db.query("update workspace_notifications set title='forged'"));
   await db.query('update workspace_notifications set read=true');
   await db.exec('reset role');await identity(ADMIN,'admin@example.com');
   assert.ok((await db.query('select * from audit_events')).rows.length>0);
 });
 await t.test('client project tasks expose safe fields only',async()=>{
   await db.exec(readDatabaseSection('client-project-tasks'));
   await identity(CLIENT,'client@example.com');await db.exec('set role authenticated');
   const projects=(await db.query('select read_client_projects() result')).rows[0].result;
   assert.ok(!projects.some(p=>p.external_id==='PRIVATE'));
   const project=projects.find(p=>p.external_id==='NOTICE-PROJECT');
   assert.ok(project.tasks.length);
   assert.deepEqual(Object.keys(project).sort(),['id','external_id','title','logo_data_url','client_company','status','details','tasks','total_tasks','completed_tasks'].sort());
   assert.deepEqual(Object.keys(project.details).sort(),['services','start_date','scope_included','scope_excluded','assumptions'].sort());
   assert.deepEqual(Object.keys(project.tasks[0]).sort(),['id','status','title']);
   await db.exec('reset role');
 });
 await db.close();
});
