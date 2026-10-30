import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { WorkspaceRole } from "@/lib/roles";

const validRoles: WorkspaceRole[] = ["admin", "employee", "client"];

async function authorizeAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { error: NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY in the server environment to manage users." }, { status: 503 }) };
  const accessToken = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!accessToken) return { error: NextResponse.json({ error: "Sign in as an administrator to manage users." }, { status: 401 }) };

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(accessToken);
  const user = data.user;
  if (error || !user) return { error: NextResponse.json({ error: "Your session expired. Sign in again and retry." }, { status: 401 }) };

  let membership = await client.from("workspace_members").select("id,role").eq("user_id", user.id).maybeSingle();
  if (!membership.data && user.email) membership = await client.from("workspace_members").select("id,role").eq("email", user.email.toLowerCase()).is("user_id",null).maybeSingle();
  const configuredAdminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
  const configuredAdmin = user.email?.toLowerCase() === configuredAdminEmail;
  let callerIsAdmin = membership.data?.role === "admin";
  if (configuredAdmin && !membership.data && !membership.error) {
    const {error: bootstrapError} = await client.rpc("bootstrap_workspace_admin", {p_user_id:user.id});
    if (bootstrapError) return {error:NextResponse.json({error:bootstrapError.message},{status:403})};
    callerIsAdmin = true;
  }
  if (membership.error) return { error: NextResponse.json({ error: membership.error.message }, { status: 500 }) };
  if (!callerIsAdmin) return { error: NextResponse.json({ error: "Only administrators can manage workspace roles." }, { status: 403 }) };
  return { client, user };
}

function readJson(request: Request) {
  return request.json().catch(() => null) as Promise<unknown>;
}

function userBody(value: unknown): value is { id?: unknown; email?: unknown; name?: unknown; password?: unknown; role?: unknown } {
  return Boolean(value && typeof value === "object");
}

export async function GET(request: Request) {
  const auth = await authorizeAdmin(request);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.client.from("workspace_members")
    .select("id,email,role,display_name,created_at,user_id,must_change_password")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorizeAdmin(request);
  if ("error" in auth) return auth.error;
  const body: unknown = await readJson(request);
  if (!userBody(body)) return NextResponse.json({ error: "Enter the new user's details." }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Enter the user's name." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Use a password with at least 8 characters." }, { status: 400 });
  if (typeof role !== "string" || !validRoles.includes(role as WorkspaceRole)) return NextResponse.json({ error: "Choose Administrator, Employee, or Client access." }, { status: 400 });
  if (email === auth.user.email?.toLowerCase()) return NextResponse.json({ error: "That email belongs to the signed-in administrator." }, { status: 400 });

  const { data: created, error } = await auth.client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !created.user) return NextResponse.json({ error: error?.message || "Supabase could not create the account." }, { status: 400 });
  const { error: membershipError } = await auth.client.from("workspace_members").upsert({
    user_id: created.user.id,
    email,
    role,
    display_name: name,
    must_change_password: false,
  }, { onConflict: "email" });
  if (membershipError) {
    await auth.client.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: `Unable to save the user's workspace role: ${membershipError.message}` }, { status: 500 });
  }
  if (role === "client") {
    const linked = await auth.client.from("clients").update({client_user_id:created.user.id}).ilike("email",email.replace(/[%_]/g,"\\$&"));
    if (linked.error) return NextResponse.json({error:"Account created, but existing client records could not be linked. Retry account linking before use."},{status:500});
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdmin(request);
  if ("error" in auth) return auth.error;
  const body: unknown = await readJson(request);
  if (!userBody(body) || typeof body.id !== "string" || typeof body.role !== "string" || !validRoles.includes(body.role as WorkspaceRole)) {
    return NextResponse.json({ error: "Choose a valid user and access role." }, { status: 400 });
  }
  const { data: target, error: lookupError } = await auth.client.from("workspace_members").select("id,user_id,role").eq("id", body.id).maybeSingle();
  if (lookupError || !target) return NextResponse.json({ error: lookupError?.message || "User not found." }, { status: 404 });
  if (target.user_id === auth.user.id && body.role !== "admin") return NextResponse.json({ error: "You cannot remove your own administrator access." }, { status: 400 });
  if (target.role === "admin" && body.role !== "admin") {
    const admins = await auth.client.from("workspace_members").select("id", { count: "exact", head: true }).eq("role", "admin");
    if (admins.error) return NextResponse.json({ error: admins.error.message }, { status: 500 });
    if ((admins.count ?? 0) <= 1) return NextResponse.json({ error: "The workspace must keep at least one administrator." }, { status: 400 });
  }
  const { error } = await auth.client.from("workspace_members").update({ role: body.role }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await authorizeAdmin(request);
  if ("error" in auth) return auth.error;
  const body: unknown = await readJson(request);
  if (!userBody(body) || typeof body.id !== "string") return NextResponse.json({ error: "Choose a user to remove." }, { status: 400 });
  const { data: target, error: lookupError } = await auth.client.from("workspace_members").select("id,user_id,role").eq("id", body.id).maybeSingle();
  if (lookupError || !target) return NextResponse.json({ error: lookupError?.message || "User not found." }, { status: 404 });
  if (target.user_id === auth.user.id) return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  if (target.role === "admin") {
    const admins = await auth.client.from("workspace_members").select("id", { count: "exact", head: true }).eq("role", "admin");
    if (admins.error) return NextResponse.json({ error: admins.error.message }, { status: 500 });
    if ((admins.count ?? 0) <= 1) return NextResponse.json({ error: "The workspace must keep at least one administrator." }, { status: 400 });
  }
  if (target.user_id) {
    const { error } = await auth.client.auth.admin.deleteUser(target.user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await auth.client.from("workspace_members").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
