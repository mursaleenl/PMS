import { NextResponse } from "next/server";
import { authenticatedDatabase } from "@/lib/authenticated-api";
export const dynamic="force-dynamic";
type Context={params:Promise<{projectId:string}>};
async function authorize(request:Request,context:Context) {
  const auth=await authenticatedDatabase(request);
  if (!auth) return null;
  const {projectId}=await context.params;
  const {data,error}=await auth.client.from("projects").select("id").eq("external_id",projectId).maybeSingle();
  if(!error&&data)return {...auth,project:data};
  const visible=await auth.client.rpc("read_client_projects");
  const shared=Array.isArray(visible.data)?visible.data.find(project=>project.external_id===projectId||project.id===projectId):null;
  return visible.error||!shared?null:{...auth,project:{id:shared.id}};
}
export async function GET(request:Request,context:Context) {
  const auth=await authorize(request,context);
  if (!auth) return NextResponse.json({error:"Project unavailable."},{status:404});
  const {data,error}=await auth.client.from("project_messages").select("id,body,sender_name,created_at").eq("project_id",auth.project.id).order("created_at",{ascending:false}).limit(100);
  if(error) return NextResponse.json({error:"Unable to load messages."},{status:503});
  return NextResponse.json({messages:(data??[]).reverse()},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request,context:Context) {
  const auth=await authorize(request,context);
  if (!auth) return NextResponse.json({error:"Project unavailable."},{status:404});
  const body=await request.json().catch(()=>null);
  if (typeof body?.message!=="string" || !body.message.trim() || body.message.length>5000) return NextResponse.json({error:"Enter a message of up to 5,000 characters."},{status:400});
  const {error}=await auth.client.from("project_messages").insert({project_id:auth.project.id,sender_id:auth.user.id,sender_name:String(auth.user.user_metadata?.full_name || auth.user.email || "Team member").slice(0,200),body:body.message.trim()});
  if(error) return NextResponse.json({error:"Message could not be saved."},{status:503});
  return NextResponse.json({success:true});
}
