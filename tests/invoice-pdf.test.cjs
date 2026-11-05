const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
test('client PDF serves the saved bytes only for an owned paid invoice',async()=>{
 const bytes=Buffer.from('%PDF-1.4\nSaved admin invoice');let downloads=0;
 const load=createLoader({
  '@/lib/authenticated-api':{authenticatedDatabase:async()=>({user:{id:'client'},client:{rpc:async name=>({data:name==='current_workspace_role'?'client':{invoices:[{id:'own',number:'SER-001',status:'CONFIRMED_PAID'},{id:'pending',number:'SER-002',status:'SENT'}]}})}})},
  '@/lib/server-supabase':{serverSupabase:()=>({storage:{from:()=>({download:async path=>{downloads++;assert.equal(path,'own.pdf');return {data:new Blob([bytes],{type:'application/pdf'})};}})}})}
 });
 const route=load('app/api/invoices/[invoiceNumber]/pdf/route.ts');
 const request=new Request('http://localhost/api/invoices/SER-001/pdf');
 const response=await route.GET(request,{params:Promise.resolve({invoiceNumber:'SER-001'})});
 assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 for(const number of ['OTHER','SER-002'])assert.equal((await route.GET(request,{params:Promise.resolve({invoiceNumber:number})})).status,404);
 assert.equal((await route.POST(request,{params:Promise.resolve({invoiceNumber:'SER-001'})})).status,403);
 assert.equal(downloads,1);
});
