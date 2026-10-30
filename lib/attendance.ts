import {supabase} from "@/lib/supabase";
export type AttendanceStatus="PRESENT"|"REMOTE"|"HALF_DAY"|"ON_LEAVE"|"ABSENT";
export const ATTENDANCE_STATUS_LABELS:Record<AttendanceStatus,string>={PRESENT:"Present",REMOTE:"Remote",HALF_DAY:"Half day",ON_LEAVE:"On leave",ABSENT:"Absent"};
export type AttendanceRecord={id?:string;userId:string;date:string;status:AttendanceStatus;hoursLogged:number;notes?:string};
export function getTodayDateString(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;}
export async function readAttendanceRecords(start:string,end:string):Promise<AttendanceRecord[]> {
 if(!supabase)throw new Error("Database is not configured.");
 const records:AttendanceRecord[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await supabase.from("attendance_records").select("id,user_id,work_date,status,hours_logged,notes").gte("work_date",start).lte("work_date",end).order("id").range(offset,offset+499);
  if(error)throw new Error(error.message);
  records.push(...(data??[]).map(row=>({id:row.id,userId:row.user_id,date:row.work_date,status:row.status as AttendanceStatus,hoursLogged:Number(row.hours_logged),notes:row.notes||undefined})));
  if((data?.length??0)<500)return records;
 }
}
export async function saveAttendanceRecord(record:AttendanceRecord){
 if(!supabase)throw new Error("Database is not configured.");
 if(!record.userId || !Number.isFinite(record.hoursLogged) || record.hoursLogged<0 || record.hoursLogged>24)throw new Error("Enter a user and hours from 0 to 24.");
 if(!record.notes || record.notes.trim().length<3 || record.notes.length>2000)throw new Error("Enter an attendance reason (3–2000 characters).");
 const {error}=await supabase.from("attendance_records").upsert({user_id:record.userId,work_date:record.date,status:record.status,hours_logged:record.hoursLogged,notes:record.notes||null,source:"manual",updated_at:new Date().toISOString()},{onConflict:"user_id,work_date"});
 if(error)throw new Error(error.message);
}
export function getUserAttendanceSummary(userId:string,records:AttendanceRecord[],daysWindow=30){
 const earliest=new Date();earliest.setDate(earliest.getDate()-daysWindow+1);earliest.setHours(0,0,0,0);
 const rows=records.filter(row=>row.userId===userId && new Date(`${row.date}T12:00:00`)>=earliest);
 const activeDays=rows.reduce((sum,row)=>sum+(row.status==="PRESENT"||row.status==="REMOTE"?1:row.status==="HALF_DAY"?0.5:0),0);
 return {totalRecords:rows.length,activeDays,attendanceRate:rows.length?Math.round(activeDays/rows.length*100):0,totalHours:rows.reduce((sum,row)=>sum+row.hoursLogged,0)};
}
