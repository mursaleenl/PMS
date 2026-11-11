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

test('client projects require authenticated RPC access and strip internal fields from older responses', async()=>{
 let auth=null, serviceCalls=0;
 const project={id:'P1',title:'Branding, Website',client_company:'ZeroGrid LLC',status:'ACTIVE',total_tasks:0,completed_tasks:0,
  team:[{name:'Private employee'}],staging_url:'https://private.example',details:{services:['Branding'],scope_included:'Website delivery',operating_company:'Servn',revision_rounds:3,secret:'private'}};
 const load=createLoader({'@/lib/authenticated-api':{authenticatedDatabase:async()=>auth},'@/lib/server-supabase':{serverSupabase:()=>{serviceCalls++;throw new Error('Unexpected service access');}}});
 const api=load('app/api/client/workspace/route.ts'),request=new Request('http://localhost/api/client/workspace');
 assert.equal((await api.GET(request)).status,401);
 auth={user:{id:'CLIENT'},client:{rpc:async()=>({error:{message:'Client access required'}})}};
 assert.equal((await api.GET(request)).status,503);
 auth.client.rpc=async()=>({data:[project]});
 const response=await api.GET(request),body=await response.json();
 assert.equal(body.projects[0].client_company,'ZeroGrid LLC');
 assert.equal(body.projects[0].details.scope_included,'Website delivery');
 for(const key of ['team','staging_url'])assert.equal(body.projects[0][key],undefined);
 for(const key of ['operating_company','revision_rounds','secret'])assert.equal(body.projects[0].details[key],undefined);
 assert.equal(serviceCalls,0);
});

test('legacy client project enrichment scopes both project IDs and account ownership',async()=>{
 const previousKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
 const filters=[];
 try {
  const load=createLoader({'@/lib/authenticated-api':{authenticatedDatabase:async()=>({user:{id:'CLIENT'},client:{rpc:async()=>({data:[{id:'P1',title:'Branding',total_tasks:0,completed_tasks:0}]})}})},
   '@/lib/server-supabase':{serverSupabase:()=>({from:table=>({select:columns=>{
    assert.ok(!columns.includes('operating_company'));assert.ok(!columns.includes('project_links'));assert.ok(!columns.includes('team'));
    if(table==='clients')return {eq:async(key,value)=>{filters.push([key,value]);return {data:[{id:'C1',company_name:'ZeroGrid LLC'}]};}};
    return {in:(key,values)=>{filters.push([key,values]);return {in:async(key,values)=>{filters.push([key,values]);return {data:[{id:'P1',client_id:'C1',services:['Branding'],scope_included:'Agreed scope'}]};}};}};
   }})})}});
  const response=await load('app/api/client/workspace/route.ts').GET(new Request('http://localhost/api/client/workspace'));
  assert.equal(response.status,200);
  const project=(await response.json()).projects[0];
  assert.equal(project.client_company,'ZeroGrid LLC');assert.equal(project.details.scope_included,'Agreed scope');
  assert.deepEqual(filters,[['client_user_id','CLIENT'],['id',['P1']],['client_id',['C1']]]);
 } finally {if(previousKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previousKey;}
});

test('shared project messages use client-visible RPC membership and reject unrelated projects',async()=>{
 let permitted=true,reads=0;
 const chain={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null}),order(){return this;},limit:async()=>{reads++;return {data:[],error:null};}};
 const client={from:()=>chain,rpc:async()=>({data:permitted?[{id:'shared-id',external_id:'SHARED-1'}]:[],error:null})};
 const api=createLoader({'@/lib/authenticated-api':{authenticatedDatabase:async()=>({client,user:{id:'CLIENT'}})}})('app/api/projects/[projectId]/messages/route.ts');
 const request=new Request('http://localhost/api/projects/SHARED-1/messages'),context={params:Promise.resolve({projectId:'SHARED-1'})};
 assert.equal((await api.GET(request,context)).status,200);assert.equal(reads,1);
 permitted=false;assert.equal((await api.GET(request,context)).status,404);assert.equal(reads,1);
});
