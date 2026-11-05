import {NextResponse} from 'next/server';
import {authenticatedDatabase} from '@/lib/authenticated-api';
export async function POST(request:Request){
 const auth=await authenticatedDatabase(request);
 if(!auth)return NextResponse.json({error:'Sign in to submit a payment reference.'},{status:401});
 let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
 if(typeof body?.invoiceId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.invoiceId)||(body?.reference!=null&&typeof body.reference!=='string')||(body?.reference?.trim().length??0)>200)return NextResponse.json({error:'Enter a valid payment reference of up to 200 characters.'},{status:400});
 const {error}=await auth.client.rpc('submit_invoice_payment_reference',{p_invoice_id:body.invoiceId,p_reference:body.reference?.trim()||''});
 if(error)return NextResponse.json({error:'Unable to submit. Check that the invoice is awaiting payment and retry.'},{status:400});
 return NextResponse.json({ok:true});
}
export async function GET(request:Request){
 const auth=await authenticatedDatabase(request);
 if(!auth)return NextResponse.json({error:'Sign in to view payment references.'},{status:401});
 const {data,error}=await auth.client.from('invoice_payment_references').select('invoice_id,reference,submitted_at,invoices(invoice_number)');
 if(error)return NextResponse.json({error:'Payment references are unavailable. Apply the payment-reference migration.'},{status:503});
 return NextResponse.json({references:data},{headers:{'Cache-Control':'no-store'}});
}
