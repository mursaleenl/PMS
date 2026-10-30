import { supabase } from "@/lib/supabase";
import type { OperatingCompany } from "@/lib/companies";
export async function reserveWorkspaceNumber(kind: "project" | "invoice" | "retainer", company: OperatingCompany) {
  if (!supabase) throw new Error("Database is not configured.");
  const {data,error} = await supabase.rpc("reserve_workspace_number", {p_kind:kind,p_company:company});
  if (error) throw new Error(`Could not reserve a ${kind} number: ${error.message}`);
  if (typeof data !== "string") throw new Error("The database did not return a number.");
  return data;
}
