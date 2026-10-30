"use client";

import Link from "next/link";
import {useEffect,useState,use} from "react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {attendanceRpc,attendanceTime,officeDate,readAttendanceSettings,readOpenAttendanceSession,type AttendanceSession,type AttendanceSettings} from "@/lib/qr-attendance";

export default function AttendanceScanPage({params}:{params:Promise<{token:string}>}){
  const {token}=use(params);
  const {user}=useWorkspaceAuth();
  const [visit,setVisit]=useState<AttendanceSession|null>(null);
  const [settings,setSettings]=useState<AttendanceSettings|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[success,setSuccess]=useState("");
  const [attempt,setAttempt]=useState(0);
  const validToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    void Promise.all([readOpenAttendanceSession(),readAttendanceSettings()]).then(([current,office])=>{
      if(!cancelled){setVisit(current);setSettings(office);setError("");}
    }).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Unable to load attendance.");}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[attempt]);
  const stale=Boolean(visit&&settings&&visit.work_date!==officeDate(settings.timezone));
  async function confirm(){
    if(busy||success||!settings||!validToken)return;
    setBusy(true);setError("");
    try{
      const action=visit?"check_out":"check_in";
      const result=await attendanceRpc<AttendanceSession>("scan_attendance",{p_token:token,p_action:action});
      if(action==="check_in"&&result.checked_out_at)throw new Error("This QR already recorded a completed visit. Scan the current office QR to start another visit.");
      if(action==="check_out"&&result.id!==visit?.id)throw new Error("This QR was already used for an earlier departure. Scan the current office QR to check out of this visit.");
      setSuccess(`${action==="check_in"?"Checked in":"Checked out"} at ${attendanceTime((action==="check_in"?result.checked_in_at:result.checked_out_at)!,settings.timezone)}.`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Attendance could not be saved.");}
    finally{setBusy(false);}
  }
  return <div className="page-content attendance-page"><section className="panel attendance-scan"><h1>{settings?.office_name||"Office attendance"}</h1><p>{user?.email}</p>{loading?<p role="status">Loading your attendance…</p>:<>{!validToken?<p role="alert">This attendance link is invalid. Scan the current office QR.</p>:success?<p role="status">{success}</p>:settings&&<><h2>{stale?"Missing checkout":visit?"Ready to check out?":"Ready to check in?"}</h2><p>{visit?`Arrival: ${attendanceTime(visit.checked_in_at,settings.timezone)}`:"Confirm your arrival at the office."}</p>{stale?<p>Ask an administrator to correct your previous visit before checking in again.</p>:<button className="button button-primary" disabled={busy} onClick={()=>void confirm()}>{busy?"Saving…":visit?"Confirm check-out":"Confirm check-in"}</button>}<p className="storage-note">If your QR expires while signing in, scan the current code again. Timezone: {settings.timezone}.</p></>}{error&&<p role="alert" className="form-error">{error}</p>}{!settings&&<button className="button button-quiet" onClick={()=>setAttempt(value=>value+1)}>Retry loading</button>}</>}<Link href="/work/attendance">View attendance history</Link></section></div>;
}
