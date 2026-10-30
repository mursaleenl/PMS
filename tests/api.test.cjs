const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');

test('assignee directory requires authentication',async()=>{
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
 try {
  const load=createLoader({'@supabase/supabase-js':{createClient:()=>({})}});
  const response=await load('app/api/assignees/route.ts').GET(new Request('http://localhost/api/assignees'));
  assert.equal(response.status,401);
 } finally {if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
test('proposal API rejects invalid tokens and oversized/invalid responses before database access',async()=>{
 let databaseCalls=0;
 const load=createLoader({'@/lib/server-supabase':{serverSupabase:()=>{databaseCalls++;throw new Error('Unexpected database access');}},'@/lib/relational-sync':{rowToProposal:row=>row}});
 const api=load('app/api/proposals/[token]/route.ts');
 assert.equal((await api.GET(new Request('http://localhost/api/proposals/x'),{params:Promise.resolve({token:'x'})})).status,404);
 const invalid=new Request('http://localhost/api/proposals/valid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({response:'ACCEPTED',name:'a'.repeat(201),note:''})});
 assert.equal((await api.POST(invalid,{params:Promise.resolve({token:'12345678-1234-1234-1234-123456789012'})})).status,400);
 assert.equal(databaseCalls,0);
});
test('proposal GET returns only the scoped proposal and POST reports database refusal',async()=>{
 const load=createLoader({'@/lib/server-supabase':{serverSupabase:()=>({rpc:async name=>name==='read_shared_proposal'?{data:{lead:{id:'L1',fullName:'Client'},proposal:{version:1,status:'SENT'}},error:null}:{error:{message:'This proposal has expired.'}}})},'@/lib/relational-sync':{rowToProposal:row=>row}});
 const api=load('app/api/proposals/[token]/route.ts'),context={params:Promise.resolve({token:'12345678-1234-1234-1234-123456789012'})};
 const response=await api.GET(new Request('http://localhost/api/proposals/token'),context);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).lead.proposals.length,1);
 const result=await api.POST(new Request('http://localhost/api/proposals/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({response:'ACCEPTED',name:'Approver',note:''})}),context);
 assert.equal(result.status,409);assert.match((await result.json()).error,/expired/);
});
