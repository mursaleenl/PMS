import {NextResponse} from 'next/server';
import {authenticatedDatabase} from '@/lib/authenticated-api';
import {serverSupabase} from '@/lib/server-supabase';
export async function POST(request:Request){
 const auth=await authenticatedDatabase(request);
 if(!auth)return NextResponse.json({error:'Sign in to submit a payment reference.'},{status:401});
 let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
 if(typeof body?.invoiceId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.invoiceId)||(body?.reference!=null&&typeof body.reference!=='string')||(body?.reference?.trim().length??0)>200)return NextResponse.json({error:'Enter a valid payment reference of up to 200 characters.'},{status:400});
 const {error}=await auth.client.rpc('submit_invoice_payment_reference',{p_invoice_id:body.invoiceId,p_reference:body.reference?.trim()||''});
 if(error){
  if(['PGRST202','PGRST205','42P01','42883'].includes(error.code))return NextResponse.json({error:'Payment reporting is not set up yet. Ask your administrator to apply the invoice payment references database migration.'},{status:503});
  if(error.code==='23514')return NextResponse.json({error:'The database still requires a reference number. Ask your administrator to apply the updated invoice payment references migration to make it optional.'},{status:503});
  if(error.code==='42501')return NextResponse.json({error:'This invoice is not available for payment reporting from your account.'},{status:403});
  if(error.message==='This invoice is not awaiting payment')return NextResponse.json({error:'This invoice is no longer awaiting payment. Refresh your invoices to see its current status.'},{status:409});
  return NextResponse.json({error:'Payment could not be reported. Please retry or contact your administrator.'},{status:503});
 }
 return NextResponse.json({ok:true,report:{invoice_id:body.invoiceId,reference:body.reference?.trim()||'',submitted_at:new Date().toISOString(),invoices:null}});
}
export async function GET(request:Request){
 const auth=await authenticatedDatabase(request);
 if(!auth)return NextResponse.json({error:'Sign in to view payment references.'},{status:401});
 const {data,error}=await auth.client.from('invoice_payment_references').select('invoice_id,reference,submitted_at,invoices(invoice_number,sent_at)');
 if(error)return NextResponse.json({error:'Payment references are unavailable. Apply the payment-reference migration.'},{status:503});
 // Client invoice RLS can hide the joined invoice, including its sent_at.
 // Hydrate only IDs from the caller-authorized payment reports.
 let invoiceRows: {id:string;invoice_number:string;sent_at:string|null}[]=[];
 if(data?.length&&process.env.SUPABASE_SERVICE_ROLE_KEY){
  const {data:invoices,error:invoiceError}=await serverSupabase().from('invoices').select('id,invoice_number,sent_at').in('id',data.map(row=>row.invoice_id));
  if(invoiceError)return NextResponse.json({error:'Unable to check payment report status. Please retry.'},{status:503});
  invoiceRows=invoices??[];
 }
 const references=(data??[]).flatMap(row=>{
  const invoice=invoiceRows.find(invoice=>invoice.id===row.invoice_id)||(Array.isArray(row.invoices)?row.invoices[0]:row.invoices);
  if(invoice?.sent_at&&Date.parse(row.submitted_at)<Date.parse(invoice.sent_at))return [];
  return [{...row,invoices:invoice?{invoice_number:invoice.invoice_number}:null}];
 });
 return NextResponse.json({references},{headers:{'Cache-Control':'no-store'}});
}
