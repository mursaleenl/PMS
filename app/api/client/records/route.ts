import {serverSupabase} from "@/lib/server-supabase";
import { NextResponse } from "next/server";
import { authenticatedDatabase } from "@/lib/authenticated-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await authenticatedDatabase(request);
  if (!auth) return NextResponse.json({error: "Sign in to view your records."}, {status: 401});
  const {data, error} = await auth.client.rpc("read_client_records");
  if (error) return NextResponse.json({error: "Unable to load your records. Please retry."}, {status: 503});
  // Render the saved invoice row, including on installations with older portal RPCs.
  if (data?.invoices?.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service=serverSupabase();
    const {data:accounts,error:accountError}=await service.from("clients").select("id").eq("client_user_id",auth.user.id);
    if(accountError)return NextResponse.json({error:"Unable to load invoice details."},{status:503});
    if(accounts?.length){
      const {data:invoices,error:invoiceError}=await service.from("invoices").select("id,operating_company,bill_to,quantity,unit_price,subtotal,gst_enabled,gst_amount,gst_rate,contract_value,deposit_amount,description,total,currency,issue_date,due_date,payment_terms,payment_instructions,status,transaction_reference,confirmed_paid_at")
        .in("id",data.invoices.map((invoice:{id:string})=>invoice.id)).in("client_id",accounts.map(account=>account.id));
      if(invoiceError)return NextResponse.json({error:"Unable to load invoice details."},{status:503});
      data.invoices=data.invoices.map((invoice:{id:string})=>({...invoice,...invoices?.find(row=>row.id===invoice.id)}));
    }
  }
  return NextResponse.json(data, {headers: {"Cache-Control": "no-store"}});
}
