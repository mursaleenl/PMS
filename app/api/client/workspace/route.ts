import { NextResponse } from "next/server";
import { authenticatedDatabase } from "@/lib/authenticated-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await authenticatedDatabase(request);
  if (!auth) return NextResponse.json({error: "Sign in to view your projects."}, {status: 401});
  const {data, error} = await auth.client.rpc("read_client_projects");
  if (error) return NextResponse.json({error: "Unable to load your projects. Please retry."}, {status: 503});
  return NextResponse.json({projects: data ?? []}, {headers: {"Cache-Control": "no-store"}});
}
