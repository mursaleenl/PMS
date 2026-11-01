"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import QRCode from "qrcode";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {attendanceRpc,type AttendanceChallenge} from "@/lib/qr-attendance";

export default function OfficeAttendancePage(){
  const {role}=useWorkspaceAuth();
  const [challenge,setChallenge]=useState<AttendanceChallenge|null>(null);
  const [qr,setQr]=useState("");
  const [remaining,setRemaining]=useState(0);
  const [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(role!=="admin")return;
    let cancelled=false,expires=0,pending=false,retryAfter=0;
    async function refresh(){
      if(pending||Date.now()<retryAfter)return;
      pending=true;
      try{
        const value=await attendanceRpc<AttendanceChallenge>("issue_attendance_challenge");
        const image=await QRCode.toDataURL(`${window.location.origin}/work/attendance/${value.token}`,{width:360,margin:4,errorCorrectionLevel:"M",color:{dark:"#000000",light:"#ffffff"}});
        if(cancelled)return;
        // Use the server's remaining validity rather than trusting the display device's clock.
        expires=Date.now()+new Date(value.expiresAt).getTime()-new Date(value.serverTime).getTime()-1500;
        setChallenge(value);setQr(image);setError("");
        setRemaining(Math.max(0,Math.floor((expires-Date.now())/1000)));
      }catch(cause){if(!cancelled){setError(cause instanceof Error?cause.message:"Unable to refresh QR.");setQr("");retryAfter=Date.now()+10000;}}
      finally{pending=false;}
    }
    void refresh();
    const timer=setInterval(()=>{
      const seconds=Math.max(0,Math.floor((expires-Date.now())/1000));
      setRemaining(seconds);
      if(seconds===0){setQr("");void refresh();}
    },1000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[role,attempt]);
  if(role!=="admin")return <div className="page-content"><h1>Office attendance</h1><p>Only administrators can display the office QR.</p></div>;
  return <div className="page-content attendance-page"><Link href="/work/attendance">← Attendance</Link><section className="panel attendance-office"><h1>{challenge?.officeName||"Office attendance"}</h1><p>Employees scan this QR with their phone to record check-in or check-out.</p>{qr&&remaining>0?<img src={qr} width={360} height={360} alt="Office attendance QR code"/>:<div className="attendance-qr-placeholder" role="status">Preparing office QR…</div>}<p role="status">{remaining>0?`Refreshes in ${remaining} seconds`:"Refreshing QR…"}</p>{error&&<><p role="alert" className="form-error">{error}</p><button className="button button-quiet" onClick={()=>setAttempt(value=>value+1)}>Retry</button></>}<p className="storage-note">Keep this screen at the office. This QR expires after 60 seconds. Office timezone: {challenge?.timezone||"—"}.</p></section></div>;
}
