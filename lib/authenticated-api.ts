import { createClient } from "@supabase/supabase-js";
export async function authenticatedDatabase(request:Request) {
  const token=(request.headers.get("authorization") || "").replace(/^Bearer\s+/i,"");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data,error}=await client.auth.getUser(token);
  return error || !data.user ? null : {client,user:data.user};
}
