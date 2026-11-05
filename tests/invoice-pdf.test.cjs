const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
test('client PDF serves the saved bytes only for an owned paid invoice',async()=>{
 const bytes=Buffer.from('%PDF-1.4\nSaved admin invoice\n%%EOF');let downloads=0;
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
test('admin regeneration replaces an existing invoice PDF with the corrected export',async()=>{
 let uploaded;
 const load=createLoader({
  '@/lib/authenticated-api':{authenticatedDatabase:async()=>({user:{id:'admin'},client:{rpc:async()=>({data:'admin'})}})},
  '@/lib/server-supabase':{serverSupabase:()=>({
   from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'invoice-id',invoice_number:'SER-001',status:'SENT'}})})})}),
   storage:{createBucket:async()=>({error:{message:'Bucket already exists'}}),from:()=>({upload:async(path,bytes,options)=>{uploaded={path,bytes,options};return {error:null};}})}
  })}
 });
 const bytes=Buffer.from('%PDF-1.4\nCorrected black invoice\n%%EOF');
 const response=await load('app/api/invoices/[invoiceNumber]/pdf/route.ts').POST(new Request('http://localhost/api/invoices/SER-001/pdf',{method:'POST',body:bytes}),{params:Promise.resolve({invoiceNumber:'SER-001'})});
 assert.equal(response.status,200);
 assert.equal(uploaded.path,'invoice-id.pdf');assert.equal(uploaded.options.upsert,true);
 assert.deepEqual(Buffer.from(uploaded.bytes),bytes);
 const rejected=await load('app/api/invoices/[invoiceNumber]/pdf/route.ts').POST(new Request('http://localhost/api/invoices/SER-001/pdf',{method:'POST',body:Buffer.from('%PDF-1.4 truncated')}),{params:Promise.resolve({invoiceNumber:'SER-001'})});
 assert.equal(rejected.status,400);
 assert.deepEqual(Buffer.from(uploaded.bytes),bytes);
});
