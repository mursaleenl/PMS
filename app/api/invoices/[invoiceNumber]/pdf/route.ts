import {NextResponse} from "next/server";
import {authenticatedDatabase} from "@/lib/authenticated-api";
import {serverSupabase} from "@/lib/server-supabase";
export const dynamic="force-dynamic";
const bucket="invoice-pdfs";
type Context={params:Promise<{invoiceNumber:string}>};
async function access(request:Request,context:Context){
 const auth=await authenticatedDatabase(request);
 if(!auth)return {error:NextResponse.json({error:"Sign in required"},{status:401})};
 const {invoiceNumber}=await context.params;
 const {data:role,error}=await auth.client.rpc("current_workspace_role");
 if(error)return {error:NextResponse.json({error:"Access unavailable"},{status:503})};
 const service=serverSupabase();
 if(role==='admin'||role==='project_manager'){
  const {data:invoice,error}=await service.from('invoices').select('id,invoice_number,status').eq('invoice_number',invoiceNumber).single();
  if(error||!invoice)return {error:NextResponse.json({error:"Invoice unavailable"},{status:404})};
  return {service,invoice,admin:true};
 }
 if(role!=='client')return {error:NextResponse.json({error:"Access denied"},{status:403})};
 const {data:records,error:recordsError}=await auth.client.rpc('read_client_records');
 if(recordsError)return {error:NextResponse.json({error:"Invoice unavailable"},{status:503})};
 const invoice=records?.invoices?.find((item:{number:string;status:string})=>item.number===invoiceNumber&&item.status==='CONFIRMED_PAID');
 if(!invoice)return {error:NextResponse.json({error:"Invoice unavailable"},{status:404})};
 return {service,invoice:{id:invoice.id,invoice_number:invoice.number,status:invoice.status},admin:false};
}
export async function GET(request:Request,context:Context){
 const result=await access(request,context);if(result.error)return result.error;
 const {data,error}=await result.service.storage.from(bucket).download(`${result.invoice.id}.pdf`);
 if(error||!data)return NextResponse.json({error:"Saved PDF unavailable. Ask your team to save the admin invoice PDF."},{status:404});
 const bytes=await data.arrayBuffer();
 if(!new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF'))return NextResponse.json({error:'The saved invoice PDF is incomplete. Ask your administrator to open Preview and save the PDF again.'},{status:422});
 return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${result.invoice.invoice_number.replace(/[^A-Za-z0-9_-]/g,'_')}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function POST(request:Request,context:Context){
 const result=await access(request,context);if(result.error)return result.error;
 if(!result.admin)return NextResponse.json({error:'Admin access required'},{status:403});
 const bytes=await request.arrayBuffer();
 if(bytes.byteLength>8_000_000||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-'||!new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF'))return NextResponse.json({error:'Invalid PDF'},{status:400});
 const {error:bucketError}=await result.service.storage.createBucket(bucket,{public:false,fileSizeLimit:15000000,allowedMimeTypes:['application/pdf']});
 if(bucketError&&!/exist|duplicate/i.test(bucketError.message))return NextResponse.json({error:'PDF storage unavailable'},{status:503});
 const {error}=await result.service.storage.from(bucket).upload(`${result.invoice.id}.pdf`,bytes,{contentType:'application/pdf',upsert:true});
 if(error)return NextResponse.json({error:'Unable to save invoice PDF'},{status:503});
 return NextResponse.json({saved:true});
}
