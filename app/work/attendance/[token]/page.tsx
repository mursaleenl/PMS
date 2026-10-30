"use client";

import {useEffect,useRef,useState,use} from "react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {attendanceRpc,attendanceTime,officeDate,readAttendanceSettings,readOpenAttendanceSession,type AttendanceSession,type AttendanceSettings} from "@/lib/qr-attendance";

export default function AttendanceScanPage({params}:{params:Promise<{token:string}>}){
  const {token}=use(params);
  const {user}=useWorkspaceAuth();
  const scanPromise=useRef<{key:string;promise:Promise<{office:AttendanceSettings;message:string}>}|null>(null);
  const [settings,setSettings]=useState<AttendanceSettings|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[success,setSuccess]=useState("");
  const validToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  useEffect(()=>{
    if(!user?.id){setError("Sign in to record attendance from a scan.");setLoading(false);return;}
    const scanKey=`${user.id}:${token}`;
    setLoading(true);setError("");setSuccess("");
    let cancelled=false;
    let promise=scanPromise.current?.key===scanKey?scanPromise.current.promise:null;
    if(!promise){
      promise=(async()=>{
        if(!validToken)throw new Error("This attendance QR is invalid. Scan the current office QR.");
        const [current,office]=await Promise.all([readOpenAttendanceSession(),readAttendanceSettings()]);
        if(current&&current.work_date!==officeDate(office.timezone))throw new Error("Missing checkout from a previous day. Ask an administrator to correct the visit before scanning again.");
        const action=current?"check_out":"check_in";
        const result=await attendanceRpc<AttendanceSession>("scan_attendance",{p_token:token,p_action:action});
        if(action==="check_in"&&result.checked_out_at)throw new Error("This QR already recorded a completed visit. Scan the current office QR to start another visit.");
        if(action==="check_out"&&result.id!==current?.id)throw new Error("This QR was already used for an earlier departure. Scan the current office QR to check out of this visit.");
        return {office,message:`${action==="check_in"?"Checked in":"Checked out"} at ${attendanceTime((action==="check_in"?result.checked_in_at:result.checked_out_at)!,office.timezone)}.`};
      })();
      scanPromise.current={key:scanKey,promise};
    }
    void promise.then(({office,message})=>{if(!cancelled){setSettings(office);setSuccess(message);}})
      .catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Attendance could not be recorded. Scan the current office QR again.");})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[token,user?.id,validToken]);
  return <div className="page-content attendance-page"><section className="panel attendance-scan"><h1>{settings?.office_name||"Office attendance"}</h1><p>{user?.email}</p>{loading?<p role="status">Recording attendance from your scan…</p>:success?<p role="status">{success}</p>:<p role="alert" className="form-error">{error||"Attendance could not be recorded. Scan the current office QR again."}</p>}</section></div>;
}
