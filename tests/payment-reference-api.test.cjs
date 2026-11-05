const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
function route(error,inspect=()=>{}){return createLoader({'@/lib/authenticated-api':{authenticatedDatabase:async()=>({client:{rpc:async(name,args)=>{inspect(name,args);return {error};}}})}})('app/api/client/payment-reference/route.ts');}
function request(){return new Request('http://localhost/api/client/payment-reference',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoiceId:'00000000-0000-0000-0000-000000000001',reference:''})});}
test('missing payment setup returns an actionable setup error',async()=>{
 const response=await route({code:'PGRST202'}).POST(request());
 assert.equal(response.status,503);assert.match((await response.json()).error,/migration/);
});
test('blank references are forwarded unchanged and accepted',async()=>{
 const response=await route(null,(name,args)=>{assert.equal(name,'submit_invoice_payment_reference');assert.equal(args.p_reference,'');}).POST(request());
 assert.equal(response.status,200);
});
test('ownership and invoice-state failures have distinct responses',async()=>{
 assert.equal((await route({code:'42501'}).POST(request())).status,403);
 assert.equal((await route({code:'P0001',message:'This invoice is not awaiting payment'}).POST(request())).status,409);
});
test('reopened invoices ignore old reports but retain reports from the current payment cycle',async()=>{
 const rows=[
  {invoice_id:'old',submitted_at:'2026-11-05T10:00:00Z',invoices:{invoice_number:'OLD',sent_at:'2026-11-05T11:00:00Z'}},
  {invoice_id:'new',submitted_at:'2026-11-05T12:00:00Z',invoices:{invoice_number:'NEW',sent_at:'2026-11-05T11:00:00Z'}},
  {invoice_id:'legacy',submitted_at:'2026-11-05T10:00:00Z',invoices:{invoice_number:'LEGACY',sent_at:null}},
 ];
 const load=createLoader({'@/lib/authenticated-api':{authenticatedDatabase:async()=>({client:{from:()=>({select:async()=>({data:rows,error:null})})}})}});
 const response=await load('app/api/client/payment-reference/route.ts').GET(new Request('http://localhost/api/client/payment-reference'));
 assert.deepEqual((await response.json()).references.map(row=>row.invoice_id),['new','legacy']);
});
test('client reports are reset after reopening even when invoice RLS hides the joined invoice',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
 try{
  const load=createLoader({
   '@/lib/authenticated-api':{authenticatedDatabase:async()=>({client:{from:()=>({select:async()=>({data:[{invoice_id:'own',reference:'',submitted_at:'2026-11-05T10:00:00Z',invoices:null}],error:null})})}})},
   '@/lib/server-supabase':{serverSupabase:()=>({from:()=>({select:()=>({in:async(_column,ids)=>{assert.deepEqual(ids,['own']);return {data:[{id:'own',invoice_number:'SER-001',sent_at:'2026-11-05T11:00:00Z'}],error:null};}})})})}
  });
  const response=await load('app/api/client/payment-reference/route.ts').GET(new Request('http://localhost/api/client/payment-reference'));
  assert.equal(response.status,200);assert.deepEqual((await response.json()).references,[]);
 }finally{if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;}
});
