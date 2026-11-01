import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ assignees: [] });
  }

  const accessToken = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!accessToken) return NextResponse.json({error:"Unauthorized"}, {status:401});
  {
    const { data: { user }, error } = await client.auth.getUser(accessToken);
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let membership = await client.from("workspace_members").select("role").eq("user_id", user.id).maybeSingle();
    if (!membership.data && user.email) {
      membership = await client.from("workspace_members").select("role").eq("email", user.email.toLowerCase()).is("user_id",null).maybeSingle();
    }
    if (membership.error) return NextResponse.json({error:"Unable to verify workspace access"}, {status:503});
    const role = membership.data?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Only administrators can view workspace assignees." }, { status: 403 });
    }
  }

  const { data, error } = await client
    .from("workspace_members")
    .select("id,user_id,email,role,display_name")
    .in("role", ["admin", "employee"])
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assignees = (data ?? []).map((member) => {
    const raw = member.display_name?.trim() || member.email.split("@")[0];
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    return {
      id: member.user_id,
      name,
      email: member.email,
      role: member.role as "admin" | "employee",
    };
  });

  return NextResponse.json({ assignees });
}
