import { supabase } from "@/lib/supabase";

export type AttendanceSession = {
  id: string; user_id: string; work_date: string;
  checked_in_at: string; checked_out_at: string | null;
};
export type AttendanceSettings = { office_name: string; timezone: string };
export type AttendanceChallenge = {token:string; expiresAt:string; serverTime:string; officeName:string; timezone:string};
export async function attendanceRpc<T>(name:string, args:Record<string,unknown> = {}):Promise<T> {
  if (!supabase) throw new Error("Database is not configured.");
  const {data,error} = await supabase.rpc(name,args);
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42P01" ? "Attendance setup is incomplete. Ask an administrator to apply the QR attendance migration." : error.message);
  return data as T;
}
export async function readAttendanceSettings():Promise<AttendanceSettings> {
  if (!supabase) throw new Error("Database is not configured.");
  const {data,error}=await supabase.from("attendance_settings").select("office_name,timezone").eq("id",true).single();
  if(error)throw new Error("Attendance setup is incomplete. Apply the QR attendance migration.");
  return data;
}
export async function readAttendanceSessions(start:string,end:string):Promise<AttendanceSession[]> {
  if (!supabase) throw new Error("Database is not configured.");
  const rows:AttendanceSession[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await supabase.from("attendance_sessions").select("id,user_id,work_date,checked_in_at,checked_out_at").gte("work_date",start).lte("work_date",end).order("checked_in_at",{ascending:false}).order("id").range(offset,offset+499);
    if(error)throw new Error("Unable to load visits. Check that the QR attendance migration has been applied.");
    rows.push(...(data??[]));
    if((data?.length??0)<500)return rows;
  }
}
export async function readOpenAttendanceSession():Promise<AttendanceSession|null> {
  if (!supabase) throw new Error("Database is not configured.");
  const {data:user,error:authError}=await supabase.auth.getUser();
  if(authError||!user.user)throw new Error("Sign in again to view your attendance.");
  const {data,error}=await supabase.from("attendance_sessions").select("id,user_id,work_date,checked_in_at,checked_out_at").eq("user_id",user.user.id).is("checked_out_at",null).maybeSingle();
  if(error)throw new Error("Unable to load your current visit. Check attendance setup and retry.");
  return data;
}
export function officeDate(timezone:string,date=new Date()) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}
export function attendanceTime(value:string,timezone:string) {
  return new Intl.DateTimeFormat("en-IN",{timeZone:timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
}
