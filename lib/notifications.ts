import { supabase } from "./supabase";
export type NotificationType = "LEAD" | "TASK" | "PROJECT";
export interface WorkspaceNotification { id:string; type:NotificationType; title:string; message:string; link?:string; read:boolean; createdAt:string; }
let items: WorkspaceNotification[] = [];
let generation = 0;
function changed() { if (typeof window !== "undefined") window.dispatchEvent(new Event("evecture:notifications-updated")); }
export function resetNotifications() { generation++; items=[]; changed(); }
export function readNotifications() { return items; }
export async function refreshNotifications() {
  if (!supabase) return;
  const version=generation;
  const {data,error}=await supabase.from("workspace_notifications").select("id,type,title,message,link,read,created_at").order("created_at",{ascending:false}).limit(100);
  if (error) throw error;
  if(version!==generation)return;
  items=(data??[]).map(row=>({...row,createdAt:row.created_at})); changed();
}
async function mutate(id:string|undefined,remove:boolean) {
  if(!supabase)return;
  const query=remove ? supabase.from("workspace_notifications").delete() : supabase.from("workspace_notifications").update({read:true});
  const {error}=await (id ? query.eq("id",id) : query.in("id",items.map(item=>item.id)));
  if(error)throw error;
  await refreshNotifications();
}
export const markNotificationRead=(id:string)=>mutate(id,false);
export const markAllNotificationsRead=()=>mutate(undefined,false);
export const dismissNotification=(id:string)=>mutate(id,true);
export const clearAllNotifications=()=>mutate(undefined,true);
