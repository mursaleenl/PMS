"use client";

import Link from "next/link";
import {useEffect,useState,type FormEvent} from "react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {useAssignableUsers} from "@/lib/assignees";
import {attendanceRpc,attendanceTime,officeDate,readAttendanceSessions,readAttendanceSettings,readOpenAttendanceSession,type AttendanceSession,type AttendanceSettings} from "@/lib/qr-attendance";
import {ScanLine,UserRound,Clock3,CalendarCheck2,ArrowUpRight} from "lucide-react";
import {AttendanceCamera} from "@/app/_components/attendance-camera";
import {supabase} from "@/lib/supabase";

type Audit={id:string;changed_at:string;actor_id:string;old_record:Record<string,unknown>|null;new_record:Record<string,unknown>|null};
export default function AttendancePage(){
  const {role,user,members}=useWorkspaceAuth();
  const {users}=useAssignableUsers();
  const [scannerOpen,setScannerOpen]=useState(false),[openVisit,setOpenVisit]=useState<AttendanceSession|null>(null),[person,setPerson]=useState("");
  const [currentDayVisits,setCurrentDayVisits]=useState<AttendanceSession[]>([]);
  const [settings,setSettings]=useState<AttendanceSettings|null>(null);
  const [visits,setVisits]=useState<AttendanceSession[]>([]),[audit,setAudit]=useState<Audit[]>([]);
  const [start,setStart]=useState(()=>{const date=new Date();date.setUTCDate(date.getUTCDate()-29);return officeDate("Asia/Kolkata",date);});
  const [end,setEnd]=useState(()=>officeDate("Asia/Kolkata"));
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [attempt,setAttempt]=useState(0),[editing,setEditing]=useState<string|null>(null);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError("");
    async function load(){
      try{
        const [office,rows,current]=await Promise.all([readAttendanceSettings(),readAttendanceSessions(start,end),readOpenAttendanceSession()]);
        const today=officeDate(office.timezone);
        const todayRows=start<=today&&end>=today?rows.filter(visit=>visit.work_date===today):await readAttendanceSessions(today,today);
        let changes:Audit[]=[];
        if(role==="admin"&&supabase){
          const result=await supabase.from("attendance_audit").select("id,changed_at,actor_id,old_record,new_record").order("changed_at",{ascending:false}).limit(50);
          if(result.error)throw new Error("Unable to load correction history.");
          changes=result.data??[];
        }
        if(!cancelled){setSettings(office);setOpenVisit(current);setCurrentDayVisits(todayRows);setVisits(rows);setAudit(changes);}
      }catch(cause){if(!cancelled)setError(cause instanceof Error?cause.message:"Unable to load attendance.");}
      finally{if(!cancelled)setLoading(false);}
    }
    if(start&&end&&start<=end)void load();
    else{setLoading(false);setError("Choose a valid date range.");}
    return ()=>{cancelled=true;};
  },[start,end,attempt,role]);
  async function correct(event:FormEvent<HTMLFormElement>,id:string){
    event.preventDefault();if(busy)return;
    const data=new FormData(event.currentTarget);
    setBusy(true);setError("");
    try{
      await attendanceRpc("correct_attendance_checkout",{p_session:id,p_checkout:new Date(String(data.get("departure"))).toISOString(),p_reason:String(data.get("reason"))});
      setEditing(null);setAttempt(value=>value+1);
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to correct attendance.");}
    finally{setBusy(false);}
  }
  const timezone=settings?.timezone||"Asia/Kolkata";
  const name=(id:string)=>users.find(person=>person.id===id)?.name||(id===user?.id?"You":"Team member");
  const ownName=members.find(member=>member.user_id===user?.id)?.display_name||users.find(person=>person.id===user?.id)?.name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"My profile";
  const ownVisits=visits.filter(visit=>visit.user_id===user?.id);
  const completedHours=ownVisits.reduce((total,visit)=>total+(visit.checked_out_at?(Date.parse(visit.checked_out_at)-Date.parse(visit.checked_in_at))/3600000:0),0);
  const attendedDays=new Set(ownVisits.map(visit=>visit.work_date)).size;
  const visibleVisits=role==="admin"?(person?visits.filter(visit=>visit.user_id===person):visits):ownVisits;
  const todayVisits=currentDayVisits.filter(visit=>visit.user_id===user?.id);
  const currentStatus=openVisit?(openVisit.work_date!==officeDate(timezone)?"Missing checkout":"Checked in"):todayVisits.length?"Checked out":"Not checked in";
  return <div className="page-content attendance-page"><section className="welcome-row"><div><h1>Attendance</h1><p className="welcome-subtitle">{role==="admin"?"Office visits and team attendance.":"Your office visits and attendance history."}</p></div><div className="attendance-actions"><button className="button button-primary attendance-scan-trigger" onClick={()=>setScannerOpen(true)}><ScanLine size={17}/>Scan attendance</button>{role==="admin"&&<Link className="button button-quiet" href="/work/attendance/office">Display office QR</Link>}</div></section>
  <section className="panel attendance-profile" aria-label="My attendance profile"><div className="attendance-profile-person"><span className="attendance-profile-avatar"><UserRound size={24}/></span><div><span className="section-kicker">My attendance</span><h2>{ownName}</h2><p>{user?.email}</p><span className={`user-role-badge user-role-${role}`}>{role.charAt(0).toUpperCase()+role.slice(1)}</span></div><Link className="attendance-profile-settings" href="/settings" aria-label="Edit my profile"><ArrowUpRight size={19}/></Link></div><div className="attendance-profile-stats"><div><span>Current status</span><strong>{loading?"Loading…":error?"Unavailable":currentStatus}</strong>{openVisit&&<small>Arrived {attendanceTime(openVisit.checked_in_at,timezone)}</small>}</div><div><span><CalendarCheck2 size={14}/>Days attended</span><strong>{loading||error?"—":attendedDays}</strong><small>Selected period</small></div><div><span><Clock3 size={14}/>Recorded hours</span><strong>{loading||error?"—":completedHours.toFixed(2)}</strong><small>Completed visits · selected period</small></div></div></section>
  <section className="panel attendance-visits-panel"><div className="attendance-section-heading"><div><h2>Office visits</h2><p>Attendance history for {timezone}. Hours include completed visits only.</p></div><span className="attendance-record-count">{visibleVisits.length} {visibleVisits.length===1?"record":"records"}</span></div><div className="attendance-toolbar"><div className="form-grid attendance-filters">{role==="admin"&&<label className="field">Team member<select value={person} onChange={event=>setPerson(event.target.value)}><option value="">All team members</option>{users.filter(person=>person.id).map(person=><option key={person.id} value={person.id}>{person.name}{person.id===user?.id?" (You)":""}</option>)}</select></label>}<label className="field">From<input type="date" required value={start} max={end} onChange={event=>setStart(event.target.value)}/></label><label className="field">To<input type="date" required value={end} min={start} onChange={event=>setEnd(event.target.value)}/></label></div><button className="button button-quiet" onClick={()=>setAttempt(value=>value+1)}>Refresh history</button></div>{error&&<p role="alert" className="form-error">{error}</p>}{loading?<p role="status" className="attendance-empty-state">Loading visits…</p>:!error&&(!visibleVisits.length?<p className="attendance-empty-state">No visits recorded for this period.</p>:<div className="table-scroll"><table className="performance-table attendance-history-table"><thead><tr><th>Work date</th>{role==="admin"&&<th>Team member</th>}<th>Arrival</th><th>Departure</th><th>Hours</th><th>Status</th>{role==="admin"&&<th>Correction</th>}</tr></thead><tbody>{visibleVisits.map(visit=><tr key={visit.id}><td>{visit.work_date}</td>{role==="admin"&&<td>{name(visit.user_id)}</td>}<td>{attendanceTime(visit.checked_in_at,timezone)}</td><td>{visit.checked_out_at?attendanceTime(visit.checked_out_at,timezone):"—"}</td><td>{visit.checked_out_at?((new Date(visit.checked_out_at).getTime()-new Date(visit.checked_in_at).getTime())/3600000).toFixed(2):"—"}</td><td>{visit.checked_out_at?"Completed":visit.work_date!==officeDate(timezone)?"Missing checkout":"Checked in"}</td>{role==="admin"&&<td>{editing===visit.id?<form onSubmit={event=>void correct(event,visit.id)} className="attendance-correction"><label className="field">Departure (device local time)<input name="departure" type="datetime-local" required/></label><label className="field">Reason<input name="reason" required minLength={3} maxLength={2000}/></label><button className="button button-primary" disabled={busy}>Save correction</button><button type="button" className="button button-quiet" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></form>:<button className="button button-quiet" onClick={()=>setEditing(visit.id)}>Correct departure</button>}</td>}</tr>)}</tbody></table></div>)}</section>
  {role==="admin"&&<section className="panel attendance-audit-panel"><div className="attendance-section-heading"><div><h2>Recent attendance changes</h2><p>Latest 50 QR summaries and administrator corrections.</p></div><span className="attendance-record-count">{audit.length} {audit.length===1?"change":"changes"}</span></div>{audit.length?<div className="table-scroll"><table className="performance-table attendance-history-table"><thead><tr><th>Changed</th><th>Changed by</th><th>Details</th></tr></thead><tbody>{audit.map(change=><tr key={change.id}><td>{attendanceTime(change.changed_at,timezone)}</td><td>{name(change.actor_id)}</td><td><details><summary>{String(change.new_record?.reason||change.new_record?.notes||"Attendance updated")}</summary><p>Team member: {name(String(change.new_record?.user_id||change.old_record?.user_id||""))}</p><p>Work date: {String(change.new_record?.work_date||change.old_record?.work_date||"—")}</p>{change.old_record?.checked_in_at||change.new_record?.checked_in_at?<><p>Previous departure: {typeof change.old_record?.checked_out_at==="string"?attendanceTime(change.old_record.checked_out_at,timezone):"Missing checkout"}</p><p>Corrected departure: {typeof change.new_record?.checked_out_at==="string"?attendanceTime(change.new_record.checked_out_at,timezone):"—"}</p></>:<><p>Previous daily hours: {String(change.old_record?.hours_logged??"—")}</p><p>Updated daily hours: {String(change.new_record?.hours_logged??"—")}</p><p>Status: {String(change.new_record?.status||change.old_record?.status||"—").replaceAll("_"," ")}</p></>}</details></td></tr>)}</tbody></table></div>:<p className="attendance-empty-state">No changes recorded.</p>}</section>}{scannerOpen&&<AttendanceCamera onClose={()=>setScannerOpen(false)}/>}</div>;
}
