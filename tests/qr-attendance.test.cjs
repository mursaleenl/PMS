const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readDatabaseSection}=require('../scripts/database-sql.cjs');
const {PGlite}=require('@electric-sql/pglite');
const ADMIN='00000000-0000-0000-0000-000000000001';
const EMPLOYEE='00000000-0000-0000-0000-000000000002';
const CLIENT='00000000-0000-0000-0000-000000000003';
const OTHER='00000000-0000-0000-0000-000000000004';
test('QR attendance permissions, visits, summaries and corrections',async t=>{
 const db=new PGlite();
 const migration=readDatabaseSection('qr-attendance');
 async function identity(id,email,role='authenticated'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({email})]);
  await db.exec(`set role ${role}`);
 }
 async function scan(token,action){return (await db.query('select scan_attendance($1,$2) value',[token,action])).rows[0].value;}
 async function challenge(){await identity(ADMIN,'admin@example.com');return (await db.query('select issue_attendance_challenge() value')).rows[0].value;}
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`);
  await db.exec(readDatabaseSection('foundation').replace('create extension if not exists pgcrypto;',''));
  await db.exec(readDatabaseSection('workspace-reliability'));
  await db.exec(migration);await db.exec(migration);
  for(const [id,email] of [[ADMIN,'admin@example.com'],[EMPLOYEE,'employee@example.com'],[CLIENT,'client@example.com'],[OTHER,'other@example.com']])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,email]);
  await db.query("insert into workspace_members(user_id,email,role) values($1,'admin@example.com','admin'),($2,'employee@example.com','employee'),($3,'client@example.com','client')",[ADMIN,EMPLOYEE,CLIENT]);
  let token,first;
  await t.test('only admins can issue QR codes; clients, outsiders and anon cannot scan',async()=>{
   token=(await challenge()).token;
   assert.equal((await challenge()).token,token);
   for(const [id,email] of [[EMPLOYEE,'employee@example.com'],[CLIENT,'client@example.com'],[OTHER,'other@example.com']]){
    await identity(id,email);
    await assert.rejects(db.query('select issue_attendance_challenge()'),/Only administrators/);
    await assert.rejects(db.query('select token from attendance_challenges'),/permission denied/);
    if(id!==EMPLOYEE)await assert.rejects(scan(token,'check_in'),/workspace access required/);
   }
   await db.exec('reset role; set role anon');
   await assert.rejects(scan(token,'check_in'),/permission denied/);
  });
  await t.test('employee check-in is idempotent and cannot be directly forged',async()=>{
   await identity(EMPLOYEE,'employee@example.com');
   first=await scan(token,'check_in');
   assert.equal(first.user_id,EMPLOYEE);
   assert.equal((await scan(token,'check_in')).id,first.id);
   assert.equal((await db.query('select * from attendance_sessions')).rows.length,1);
   await assert.rejects(db.query("insert into attendance_sessions(user_id,work_date,checked_in_at,checkin_token) values($1,current_date,now(),gen_random_uuid())",[ADMIN]),/permission denied/);
   assert.equal((await db.query('select hours_logged from attendance_records')).rows[0].hours_logged,'0.00');
   await assert.rejects(scan(token,'invalid'),/Choose check in/);
  });
  await t.test('expired and unknown QR codes are rejected and a second open visit is blocked',async()=>{
   await assert.rejects(scan('99999999-9999-9999-9999-999999999999','check_out'),/QR expired/);
   await db.exec('reset role');
   await db.query("update attendance_challenges set expires_at=clock_timestamp()-interval '1 second' where token=$1",[token]);
   await identity(EMPLOYEE,'employee@example.com');
   await assert.rejects(scan(token,'check_out'),/QR expired/);
   assert.equal((await scan(first.checkin_token,'check_in')).id,first.id); // Lost response can be retried after expiry.
   token=(await challenge()).token;
   await identity(EMPLOYEE,'employee@example.com');
   await assert.rejects(scan(token,'check_in'),/already have an open visit/);
  });
  await t.test('checkout persists server time, is idempotent, and updates completed duration',async()=>{
   await db.exec('reset role');
   await db.query("update attendance_sessions set checked_in_at=clock_timestamp()-interval '15 minutes' where id=$1",[first.id]);
   await identity(EMPLOYEE,'employee@example.com');
   const closed=await scan(token,'check_out');
   assert.ok(closed.checked_out_at);
   assert.equal((await scan(token,'check_out')).checked_out_at,closed.checked_out_at);
   assert.equal(Number((await db.query('select hours_logged from attendance_records')).rows[0].hours_logged),0.25);
  });
  await t.test('employees only read their own visits, admins read team visits',async()=>{
   await identity(ADMIN,'admin@example.com');
   await scan(token,'check_in');
   assert.equal((await db.query('select * from attendance_sessions')).rows.length,2);
   await identity(EMPLOYEE,'employee@example.com');
   assert.equal((await db.query('select * from attendance_sessions')).rows.length,1);
   await identity(CLIENT,'client@example.com');
   assert.equal((await db.query('select * from attendance_sessions')).rows.length,0);
   await identity(EMPLOYEE,'employee@example.com');
   assert.equal((await db.query('select * from attendance_audit')).rows.length,0);
  });
  await t.test('manual adjustments require a reason on the server',async()=>{
   await identity(ADMIN,'admin@example.com');
   await assert.rejects(db.query("update attendance_records set source='manual',hours_logged=8,notes='' where user_id=$1",[EMPLOYEE]),/attendance reason/);
  });
  await t.test('multiple visits preserve manual corrections',async()=>{
   await identity(ADMIN,'admin@example.com');
   await db.query("update attendance_records set hours_logged=7,status='HALF_DAY',source='manual',notes='Approved correction' where user_id=$1",[EMPLOYEE]);
   await identity(EMPLOYEE,'employee@example.com');
   // The next QR permits a new visit, while replay of its check-in returns that same visit.
   const second=await scan(token,'check_in');
   assert.notEqual(second.id,first.id);
   await db.exec('reset role');
   await db.query("update attendance_challenges set expires_at=clock_timestamp()-interval '1 second'");
   token=(await challenge()).token;
   await identity(EMPLOYEE,'employee@example.com');
   await scan(token,'check_out');
   const summary=(await db.query('select * from attendance_records where user_id=$1',[EMPLOYEE])).rows[0];
   assert.equal(summary.hours_logged,'7.00');assert.equal(summary.status,'HALF_DAY');
   assert.equal((await db.query('select count(*)::int total from attendance_sessions where user_id=$1',[EMPLOYEE])).rows[0].total,2);
  });
  await t.test('corrections cannot overlap another visit',async()=>{
   await db.exec('reset role');
   const rows=(await db.query("select * from attendance_sessions where user_id=$1 order by checked_in_at",[EMPLOYEE])).rows;
   await identity(ADMIN,'admin@example.com');
   await assert.rejects(db.query('select correct_attendance_checkout($1,$2,$3)',[rows[0].id,rows[1].checked_out_at,'Extend first visit']),/overlaps another visit/);
  });
  await t.test('missing checkout blocks new attendance until an audited admin correction',async()=>{
   await db.exec('reset role');
   const old=(await db.query("insert into attendance_sessions(user_id,work_date,checked_in_at,checkin_token) values($1,(clock_timestamp() at time zone 'Asia/Kolkata')::date-1,((clock_timestamp() at time zone 'Asia/Kolkata')::date-1+time '09:00') at time zone 'Asia/Kolkata',gen_random_uuid()) returning *",[EMPLOYEE])).rows[0];
   await identity(EMPLOYEE,'employee@example.com');
   await assert.rejects(scan(token,'check_in'),/open visit/);
   // Force a fresh token so the receipt for a previous checkout is not replayed.
   await db.exec('reset role');await db.query("update attendance_challenges set expires_at=clock_timestamp()-interval '1 second'");
   token=(await challenge()).token;
   await identity(EMPLOYEE,'employee@example.com');
   await assert.rejects(scan(token,'check_out'),/Missing checkout/);
   const departure=new Date(new Date(old.checked_in_at).getTime()+8*3600000).toISOString();
   await assert.rejects(db.query('select correct_attendance_checkout($1,$2,$3)',[old.id,departure,'Forgot checkout']),/Only administrators/);
   await identity(ADMIN,'admin@example.com');
   await assert.rejects(db.query('select correct_attendance_checkout($1,$2,$3)',[old.id,departure,'']),/correction reason/);
   await assert.rejects(db.query('select correct_attendance_checkout($1,clock_timestamp()+interval \'1 day\',$2)',[old.id,'Invalid future time']),/Departure must/);
   await db.query('select correct_attendance_checkout($1,$2,$3)',[old.id,departure,'Forgot checkout']);
   assert.ok((await db.query("select * from attendance_audit where new_record->>'reason'='Forgot checkout'")).rows.length);
   await identity(EMPLOYEE,'employee@example.com');
   assert.ok((await scan(token,'check_in')).id);
  });
 }finally{await db.close();}
});
