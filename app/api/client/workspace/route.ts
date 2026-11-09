import { getProjectServices } from "@/lib/project-services";
import { NextResponse } from "next/server";
import { authenticatedDatabase } from "@/lib/authenticated-api";
import { serverSupabase } from "@/lib/server-supabase";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticatedDatabase(request);
  if (!auth) return NextResponse.json({error: "Sign in to view your projects."}, {status: 401});
  const {data, error} = await auth.client.rpc("read_client_projects");
  if (error) return NextResponse.json({error: "Unable to load your projects. Please retry."}, {status: 503});

  // Pick client-readable fields explicitly, including when an older RPC is deployed.
  const projects = (Array.isArray(data) ? data : []).map(project => ({
    id: project.id, external_id: project.external_id, title: project.title,
    client_company: project.client_company, status: project.status, logo_data_url: project.logo_data_url,
    total_tasks: project.total_tasks, completed_tasks: project.completed_tasks,
    tasks: project.tasks?.map((task: {id: string; title: string; status: string}) => ({id: task.id, title: task.title, status: task.status})),
    details: project.details ? {
      services: project.details.services, start_date: project.details.start_date,
      scope_included: project.details.scope_included, scope_excluded: project.details.scope_excluded,
      assumptions: project.details.assumptions,
    } : undefined,
  }));

  // Support existing installations whose RPC predates company names and scope.
  // Both the RPC IDs and the authenticated client's ownership must match.
  if (projects.some(project => !project.client_company || !project.details || project.logo_data_url === undefined) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service = serverSupabase();
    const {data: accounts, error: accountError} = await service.from("clients").select("id,company_name").eq("client_user_id", auth.user.id);
    if (accountError) return NextResponse.json({error: "Unable to load project details. Please retry."}, {status: 503});
    if (accounts?.length) {
      const {data: details, error: detailError} = await service.from("projects")
        .select("id,client_id,client_company,logo_data_url,services,start_date,scope_included,scope_excluded,assumptions")
        .in("id", projects.map(project => project.id)).in("client_id", accounts.map(account => account.id));
      if (detailError) return NextResponse.json({error: "Unable to load project details. Please retry."}, {status: 503});
      for (const project of projects) {
        const row = details?.find(item => item.id === project.id);
        if (!row) continue;
        project.client_company = row.client_company?.trim() || accounts.find(account => account.id === row.client_id)?.company_name;
        project.logo_data_url = row.logo_data_url;
        project.details = {services: row.services, start_date: row.start_date, scope_included: row.scope_included,
          scope_excluded: row.scope_excluded, assumptions: row.assumptions};
      }
    }
  }
  for (const project of projects) {
    if (project.details) project.details.services = getProjectServices({title: project.title, clientCompany: project.client_company, services: project.details.services});
  }
  return NextResponse.json({projects}, {headers: {"Cache-Control": "no-store"}});
}
