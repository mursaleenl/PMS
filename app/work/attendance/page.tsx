"use client";

import Link from "next/link";
import {useEffect,useState,type FormEvent} from "react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {useAssignableUsers} from "@/lib/assignees";
import {attendanceRpc,attendanceTime,officeDate,readAttendanceSessions,readAttendanceSettings,readOpenAttendanceSession,type AttendanceSession,type AttendanceSettings} from "@/lib/qr-attendance";
import {LogIn,LogOut,UserRound,Clock3,CalendarCheck2,ArrowUpRight} from "lucide-react";
import {CalendarPicker} from "@/app/_components/calendar-picker";
import {AttendanceCamera} from "@/app/_components/attendance-camera";
import {AttendanceCalendar} from "@/app/_components/attendance-calendar";
import {AttendanceChanges} from "@/app/_components/attendance-changes";

function localDateTime(value:string){
  const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());
  return date.toISOString().slice(0,16);
}

export default function AttendancePage(){
  const {role,user,members}=useWorkspaceAuth();
  const {users}=useAssignableUsers();
  const [deleting,setDeleting]=useState<string|null>(null);
  const [scanAction,setScanAction]=useState<"check_in"|"check_out"|null>(null);
  const [openVisit,setOpenVisit]=useState<AttendanceSession|null>(null),[person,setPerson]=useState<string|null>(null);
  useEffect(()=>{setPerson(null);},[user?.id]);
  const selectedPerson=person??user?.id??"";
  const [currentDayVisits,setCurrentDayVisits]=useState<AttendanceSession[]>([]);
  const [settings,setSettings]=useState<AttendanceSettings|null>(null);
  const [visits,setVisits]=useState<AttendanceSession[]>([]);
  const [start,setStart]=useState(()=>{const date=new Date();date.setUTCDate(date.getUTCDate()-29);return officeDate("Asia/Kolkata",date);});
  const [end,setEnd]=useState(()=>officeDate("Asia/Kolkata"));
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [attempt,setAttempt]=useState(0),[editing,setEditing]=useState<string|null>(null),[actionError,setActionError]=useState("");
  useEffect(()=>{
    const timezone=settings?.timezone||"Asia/Kolkata";
    let day=officeDate(timezone);
    const refresh=()=>setAttempt(value=>value+1);
    const timer=window.setInterval(()=>{
      const nextDay=officeDate(timezone);
      if(nextDay!==day){day=nextDay;refresh();}
    },30000);
    window.addEventListener("focus",refresh);
    return ()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[settings?.timezone]);
  useEffect(()=>{
    const today=officeDate(settings?.timezone||"Asia/Kolkata");
    if(end>today)setEnd(today);
    if(start>today)setStart(today);
  },[settings?.timezone,end,start]);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError("");
    async function load(){
      try{
        const [office,rows,current]=await Promise.all([readAttendanceSettings(),readAttendanceSessions(start,end),readOpenAttendanceSession()]);
        const today=officeDate(office.timezone);
        const todayRows=start<=today&&end>=today?rows.filter(visit=>visit.work_date===today):await readAttendanceSessions(today,today);
        if(!cancelled){setSettings(office);setOpenVisit(current);setCurrentDayVisits(todayRows);setVisits(rows);}
      }catch(cause){if(!cancelled)setError(cause instanceof Error?cause.message:"Unable to load attendance.");}
      finally{if(!cancelled)setLoading(false);}
    }
    if(start&&end&&start<=end)void load();
    else{setLoading(false);setError("Choose a valid date range.");}
    return ()=>{cancelled=true;};
  },[start,end,attempt,role,user?.id]);
  async function correct(event:FormEvent<HTMLFormElement>,id:string){
    event.preventDefault();if(busy)return;
    const data=new FormData(event.currentTarget);
    setBusy(true);setActionError("");
    try{
      const departure=String(data.get("departure")||"");
      await attendanceRpc("correct_attendance_session",{p_session:id,p_checkin:new Date(String(data.get("arrival"))).toISOString(),p_checkout:departure?new Date(departure).toISOString():null,p_reason:String(data.get("reason"))});
      setEditing(null);setAttempt(value=>value+1);
    }catch(cause){setActionError(cause instanceof Error?cause.message:"Unable to correct attendance.");}
    finally{setBusy(false);}
  }
  async function deleteVisit(event:FormEvent<HTMLFormElement>,id:string){
    event.preventDefault();if(busy)return;
    const data=new FormData(event.currentTarget);
    setBusy(true);setActionError("");
    try{
      await attendanceRpc("delete_attendance_session",{p_session:id,p_reason:String(data.get("reason"))});
      setDeleting(null);setAttempt(value=>value+1);
    }catch(cause){setActionError(cause instanceof Error?cause.message:"Unable to delete attendance.");}
    finally{setBusy(false);}
  }
  const timezone=settings?.timezone||"Asia/Kolkata";
  const today=officeDate(timezone);
  const localNow=new Date();localNow.setMinutes(localNow.getMinutes()-localNow.getTimezoneOffset());
  const latestDeparture=localNow.toISOString().slice(0,16);
  const name=(id:string)=>users.find(person=>person.id===id)?.name||(id===user?.id?"You":"Team member");
  const ownName=members.find(member=>member.user_id===user?.id)?.display_name||users.find(person=>person.id===user?.id)?.name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"My profile";
  const ownVisits=visits.filter(visit=>visit.user_id===user?.id);
  const completedHours=ownVisits.reduce((total,visit)=>total+(visit.checked_out_at?(Date.parse(visit.checked_out_at)-Date.parse(visit.checked_in_at))/3600000:0),0);
  const attendedDays=new Set(ownVisits.map(visit=>visit.work_date)).size;
  const visibleVisits=role==="admin"?(selectedPerson?visits.filter(visit=>visit.user_id===selectedPerson):visits):ownVisits;
  const todayVisits=currentDayVisits.filter(visit=>visit.user_id===user?.id);
  const attendanceComplete=!openVisit&&todayVisits.some(visit=>visit.checked_out_at);
  const missingCheckout=!!openVisit&&openVisit.work_date!==today;
  const currentStatus=openVisit?(openVisit.work_date!==officeDate(timezone)?"Missing checkout":"Checked in"):todayVisits.length?"Checked out":"Not checked in";
  return <div className="page-content attendance-page"><section className="welcome-row"><div><h1>Attendance</h1><p className="welcome-subtitle">{role==="admin"?"Office visits and team attendance.":"Your office visits and attendance history."}</p></div><div className="attendance-actions"><button type="button" className="button button-primary attendance-sign-trigger" disabled={loading||!!error||!!scanAction||!user?.id||attendanceComplete||missingCheckout} onClick={()=>setScanAction(openVisit?"check_out":"check_in")}>{openVisit?<LogOut size={17}/>:<LogIn size={17}/>} {attendanceComplete?"Checked out":openVisit?"Check out":"Check in"}</button>{role==="admin"&&<Link className="button button-quiet" href="/work/attendance/office">Display office QR</Link>}</div></section>
  {missingCheckout&&<p role="status">Missing checkout from a previous day. Ask an administrator to correct the visit.</p>}
  <section className="panel attendance-profile" aria-label="My attendance profile"><div className="attendance-profile-person"><span className="attendance-profile-avatar"><UserRound size={24}/></span><div><span className="section-kicker">My attendance</span><h2>{ownName}</h2><p>{user?.email}</p><span className={`user-role-badge user-role-${role}`}>{role.charAt(0).toUpperCase()+role.slice(1)}</span></div><Link className="attendance-profile-settings" href="/settings" aria-label="Edit my profile"><ArrowUpRight size={19}/></Link></div><div className="attendance-profile-stats"><div><span>Current status</span><strong>{loading?"Loading…":error?"Unavailable":currentStatus}</strong>{openVisit&&<small>Arrived {attendanceTime(openVisit.checked_in_at,timezone)}</small>}</div><div><span><CalendarCheck2 size={14}/>Days attended</span><strong>{loading||error?"—":attendedDays}</strong><small>Selected period</small></div><div><span><Clock3 size={14}/>Recorded hours</span><strong>{loading||error?"—":completedHours.toFixed(2)}</strong><small>Completed visits · selected period</small></div></div></section>
  {user?.id&&<AttendanceCalendar userId={user.id} timezone={timezone} refreshKey={attempt}/>}
  <section className="panel attendance-visits-panel"><div className="attendance-section-heading"><div><h2>Office visits</h2><p>Attendance history for {timezone}. Hours include completed visits only.</p></div><span className="attendance-record-count">{visibleVisits.length} {visibleVisits.length===1?"record":"records"}</span></div><div className="attendance-toolbar"><div className="form-grid attendance-filters">{role==="admin"&&<label className="field attendance-member-filter">Team member<select value={selectedPerson} onChange={event=>setPerson(event.target.value)}><option value="">All team members</option>{users.filter(person=>person.id).map(person=><option key={person.id} value={person.id}>{person.name}{person.id===user?.id?" (You)":""}</option>)}</select></label>}<label className="field">From<CalendarPicker ariaLabel="From" required value={start} max={end<today?end:today} onChange={value=>setStart(value>today?today:value)}/></label><label className="field">To<CalendarPicker ariaLabel="To" required value={end} min={start} max={today} onChange={value=>setEnd(value>today?today:value)}/></label></div><button className="button button-quiet" onClick={()=>setAttempt(value=>value+1)}>Refresh history</button></div>{error&&<p role="alert" className="form-error">{error}</p>}{loading?<p role="status" className="attendance-empty-state">Loading visits…</p>:!error&&(!visibleVisits.length?<p className="attendance-empty-state">No visits recorded for this period.</p>:<div className="table-scroll"><table className="performance-table attendance-history-table"><thead><tr><th>Work date</th>{role==="admin"&&<th>Team member</th>}<th>Arrival</th><th>Departure</th><th>Hours</th><th>Status</th>{role==="admin"&&<th>Actions</th>}</tr></thead><tbody>{visibleVisits.map(visit=><tr key={visit.id}><td>{visit.work_date}</td>{role==="admin"&&<td>{name(visit.user_id)}</td>}<td>{attendanceTime(visit.checked_in_at,timezone)}</td><td>{visit.checked_out_at?attendanceTime(visit.checked_out_at,timezone):"—"}</td><td>{visit.checked_out_at?((new Date(visit.checked_out_at).getTime()-new Date(visit.checked_in_at).getTime())/3600000).toFixed(2):"—"}</td><td>{visit.checked_out_at?"Completed":visit.work_date!==officeDate(timezone)?"Missing checkout":"Checked in"}</td>{role==="admin"&&<td>{editing===visit.id?<form onSubmit={event=>void correct(event,visit.id)} className="attendance-correction"><label className="field">Arrival (device local time)<CalendarPicker name="arrival" ariaLabel="Arrival (device local time)" mode="datetime" required defaultValue={localDateTime(visit.checked_in_at)} max={latestDeparture}/></label><label className="field">Departure (device local time)<CalendarPicker name="departure" ariaLabel="Departure (device local time)" mode="datetime" required={!!visit.checked_out_at} defaultValue={visit.checked_out_at?localDateTime(visit.checked_out_at):""} max={latestDeparture}/></label>{!visit.checked_out_at&&<small>Leave departure blank to keep this visit checked in.</small>}<label className="field">Reason<input name="reason" required minLength={3} maxLength={2000}/></label>{actionError&&<p role="alert" className="form-error">{actionError}</p>}<button className="button button-primary" disabled={busy}>Save correction</button><button type="button" className="button button-quiet" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></form> :deleting===visit.id?<form className="attendance-correction" onSubmit={event=>void deleteVisit(event,visit.id)}><p>Delete the visit for {name(visit.user_id)} on {visit.work_date}? This cannot be undone.</p><label className="field">Deletion reason<input name="reason" required minLength={3} maxLength={2000}/></label>{actionError&&<p role="alert" className="form-error">{actionError}</p>}<button className="button button-primary" disabled={busy}>{busy?"Deleting…":"Confirm deletion"}</button><button type="button" className="button button-quiet" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</button></form>:<div className="attendance-actions"><button className="button button-quiet" onClick={()=>{setActionError("");setDeleting(null);setEditing(visit.id);}}>Edit times</button><button className="button button-quiet" onClick={()=>{setActionError("");setEditing(null);setDeleting(visit.id);}}>Delete</button></div>}</td>}</tr>)}</tbody></table></div>)}</section>
  {role==="admin"&&<AttendanceChanges timezone={timezone} name={name} refreshKey={attempt}/>}{scanAction&&<AttendanceCamera action={scanAction} onClose={()=>setScanAction(null)}/>}</div>;
}
