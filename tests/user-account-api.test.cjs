const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
function setup({callerRole='admin', linked=true, duplicate=false, authError=null, dbError=null, self=false}={}) {
 const writes=[], authWrites=[];
 const target={id:'member',user_id:linked?(self?'caller':'target'):null,role:'employee',email:'old@example.com'};
 const client={auth:{getUser:async()=>({data:{user:{id:'caller',email:'admin@example.com'}}}),admin:{updateUserById:async(id,value)=>{authWrites.push({id,...value});return {error:authError};}}},from:()=>{
  let field, value, updating=false;
  const query={select:()=>query,eq:(f,v)=>{field=f;value=v;return query;},neq:()=>query,
   update:data=>{writes.push(data);updating=true;return query;},
   maybeSingle:async()=>({data:field==='user_id'?{id:'caller-member',role:callerRole}:field==='email'?(duplicate?{id:'other'}:null):target,error:null}),
   then:resolve=>resolve({error:updating?dbError:null})};
  return query;
 }};
 const route=createLoader({'@supabase/supabase-js':{createClient:()=>client}})('app/api/admin/users/route.ts');
 return {writes,authWrites,patch:body=>route.PATCH(new Request('http://localhost/api/admin/users',{method:'PATCH',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({id:'member',role:'employee',...body})}))};
}
test('admin changes email and password even when the role stays the same',async()=>{
 const s=setup();assert.equal((await s.patch({email:' NEW@example.com ',password:'new-secret'})).status,200);
 assert.equal(s.authWrites[0].email,'new@example.com');assert.equal(s.authWrites[0].password,'new-secret');assert.ok(s.authWrites[0].app_metadata.access_changed_at);
 assert.deepEqual(s.writes,[{role:'employee',email:'new@example.com'}]);
});
test('blank password preserves the password during an email edit',async()=>{
 const s=setup();assert.equal((await s.patch({email:'new@example.com',password:''})).status,200);assert.equal('password' in s.authWrites[0],false);
});
test('unchanged account does not write credentials',async()=>{
 const s=setup();assert.equal((await s.patch({email:'old@example.com',password:''})).status,200);assert.equal(s.authWrites.length,0);
});
test('non-admin callers cannot change accounts',async()=>{
 const s=setup({callerRole:'employee'});assert.equal((await s.patch({password:'new-secret'})).status,403);assert.equal(s.authWrites.length,0);
});
test('invalid credentials, duplicates, and unlinked accounts are rejected before auth writes',async()=>{
 for(const [options,body] of [[{},{email:'invalid'}],[{},{password:'short'}],[{duplicate:true},{email:'new@example.com'}],[{linked:false},{password:'new-secret'}]]){
  const s=setup(options);assert.equal((await s.patch(body)).status,400);assert.equal(s.authWrites.length,0);
 }
});
test('auth failures leave workspace membership untouched',async()=>{
 const s=setup({authError:{message:'Email already registered'}});assert.equal((await s.patch({email:'new@example.com'})).status,400);assert.equal(s.writes.length,0);
});
test('workspace failures roll back email and report an already-saved password',async()=>{
 const s=setup({dbError:{message:'Database unavailable'}});const response=await s.patch({email:'new@example.com',password:'new-secret'});
 assert.equal(response.status,500);assert.equal(s.authWrites[1].email,'old@example.com');assert.match((await response.json()).error,/new password was saved/);
});
