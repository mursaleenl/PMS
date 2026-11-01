import { BriefcaseBusiness, Handshake, ShieldCheck } from "lucide-react";
import type { WorkspaceRole } from "@/lib/roles";

/** Consistent Lucide role symbols across account and member views. */
export function RoleIcon({role,size=16}:{role:WorkspaceRole;size?:number}) {
  const Icon=role==="admin"?ShieldCheck:role==="employee"?BriefcaseBusiness:Handshake;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" className={`workspace-role-icon workspace-role-icon-${role}`}/>;
}
