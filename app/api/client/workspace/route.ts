import { NextResponse } from "next/server";
import { authenticatedDatabase } from "@/lib/authenticated-api";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const auth=await authenticatedDatabase(request);
  if (!auth) return NextResponse.json({error:"Sign in to view your workspace."},{status:401});
  const accounts=await auth.client.from("clients").select("id").eq("client_user_id",auth.user.id);
  if (accounts.error) return NextResponse.json({error:"Unable to load your client account."},{status:503});
  const ids=(accounts.data??[]).map(row=>row.id);
  if (!ids.length) return NextResponse.json({projects:[],proposals:[]});
  const [projects,proposals]=await Promise.all([
    auth.client.from("projects").select("id,external_id,title,status,start_date").in("client_id",ids).order("created_at",{ascending:false}),
    auth.client.from("proposals").select("id,proposal_title,project_title,share_token,status,quoted_amount,currency,expiry_date,version").in("client_id",ids).in("status",["SENT","ACCEPTED","DECLINED","CHANGES_REQUESTED"]).order("created_at",{ascending:false}),
  ]);
  if (projects.error || proposals.error) return NextResponse.json({error:"Unable to load your workspace. Please retry."},{status:503});
  const projectIds=(projects.data??[]).map(row=>row.id);
  const tasks=projectIds.length ? await auth.client.from("project_work_items").select("project_id,title,status").in("project_id",projectIds) : {data:[],error:null};
  if (tasks.error) return NextResponse.json({error:"Unable to load project progress."},{status:503});
  return NextResponse.json({projects:(projects.data??[]).map(project=>({...project,tasks:(tasks.data??[]).filter(task=>task.project_id===project.id)})),proposals:proposals.data??[]},{headers:{"Cache-Control":"no-store"}});
}
