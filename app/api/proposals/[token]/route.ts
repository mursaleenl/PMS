import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/server-supabase";
import { rowToProposal } from "@/lib/relational-sync";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
type Context={params:Promise<{token:string}>};
function validToken(token:string) { return /^[A-Za-z0-9_-]{16,200}$/.test(token); }
export async function GET(_request:Request,{params}:Context) {
  const {token}=await params;
  if (!validToken(token)) return NextResponse.json({error:"Proposal unavailable"},{status:404,headers});
  try {
    const {data,error}=await serverSupabase().rpc("read_shared_proposal",{p_token:token});
    if (error || !data) return NextResponse.json({error:"Proposal unavailable"},{status:404,headers});
    return NextResponse.json({lead:{...data.lead,proposals:[rowToProposal(data.proposal,[])]}},{headers});
  } catch { return NextResponse.json({error:"Proposal service is temporarily unavailable."},{status:503,headers}); }
}
export async function POST(request:Request,{params}:Context) {
  const {token}=await params;
  if (!validToken(token)) return NextResponse.json({error:"Proposal unavailable"},{status:404,headers});
  const body=await request.json().catch(()=>null);
  if (!body || !["ACCEPTED","DECLINED","CHANGES_REQUESTED"].includes(body.response) || typeof body.name!=="string" || typeof body.note!=="string" || body.name.length>200 || body.note.length>10000) return NextResponse.json({error:"Enter valid response details."},{status:400,headers});
  try {
    const {error}=await serverSupabase().rpc("respond_shared_proposal",{p_token:token,p_response:body.response,p_name:body.name,p_note:body.note});
    if (error) return NextResponse.json({error:error.message},{status:409,headers});
    return NextResponse.json({success:true},{headers});
  } catch { return NextResponse.json({error:"Unable to save your response. Please retry."},{status:503,headers}); }
}
