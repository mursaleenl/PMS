"use client";
import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import {Calendar,ChevronDown,ChevronLeft,ChevronRight,Clock,X} from "lucide-react";
import {isValidDateValue} from "@/lib/dates";
export interface CalendarPickerProps {
 value?:string;defaultValue?:string;onChange?:(value:string)=>void;name?:string;id?:string;placeholder?:string;required?:boolean;disabled?:boolean;
 min?:string;max?:string;mode?:"date"|"datetime"|"timeline";className?:string;ariaLabel?:string;
 quickOptions?:Array<{label:string;offsetDays?:number;special?:"today"|"tomorrow"|"now"|"+7d"|"+14d"|"+30d"}>;
}
const pad=(value:number)=>String(value).padStart(2,"0");
function dateValue(date:Date){return `${String(date.getFullYear()).padStart(4,"0")}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;}
function dateTimeValue(date:Date){return `${dateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
function parsed(value:string){
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&isValidDateValue(value)){const [y,m,d]=value.split("-").map(Number);return new Date(y,m-1,d);}
 if(!value.includes("T"))return null;
 const date=new Date(value);return Number.isNaN(date.getTime())?null:date;
}
function normalize(value:string,mode:string){const date=mode==="datetime"?parsed(value):null;return date?dateTimeValue(date):value;}
export function CalendarPicker({value,defaultValue="",onChange,name,id,placeholder,required=false,disabled=false,mode="date",className="",quickOptions,ariaLabel,min,max}:CalendarPickerProps){
 const generated=useId(),inputId=id||generated;
 const [internal,setInternal]=useState(()=>normalize(defaultValue,mode));
 const current=normalize(value===undefined?internal:value,mode);
 const selected=parsed(current);
 const input=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[touched,setTouched]=useState(false);
 const [section,setSection]=useState<"days"|"months"|"years"|"time">("days");
 const [yearDraft,setYearDraft]=useState("");
 const [placement,setPlacement]=useState({top:12,left:12,maxHeight:520});
 const [view,setView]=useState(()=>{const date=selected||new Date();return new Date(date.getFullYear(),date.getMonth(),1);});
 const [focusDate,setFocusDate]=useState("");
 const invalid=Boolean(current)&&mode!=="timeline"&&!isValidDateValue(current,mode==="datetime");
 const validation=invalid?`Enter a valid ${mode==="datetime"?"date and time (YYYY-MM-DDTHH:mm)":"date (YYYY-MM-DD)"}.`:required&&!current?"Choose a date.":current&&min&&current<min?`Choose a date on or after ${min}.`:current&&max&&current>max?`Choose a date on or before ${max}.`:"";
 useEffect(()=>{input.current?.setCustomValidity(validation);},[validation]);
 useEffect(()=>{
  if(!open)return;
  const popup=panel.current;
  if(popup?.showPopover&&!popup.matches(":popover-open"))popup.showPopover();
  const dismiss=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false);};
  const position=()=>{
   if(!root.current||!popup)return;
   const box=root.current.getBoundingClientRect(),height=Math.min(popup.scrollHeight,520,window.innerHeight-24),width=popup.getBoundingClientRect().width;
   const below=window.innerHeight-box.bottom-12;
   const top=below>=height?box.bottom+8:box.top-height-8;
   setPlacement({top:Math.max(12,Math.min(top,window.innerHeight-height-12)),left:Math.max(12,Math.min(box.left,window.innerWidth-width-12)),maxHeight:Math.min(520,window.innerHeight-24)});
  };
  position();const observer=new ResizeObserver(position);if(popup)observer.observe(popup);
  document.addEventListener("mousedown",dismiss);window.addEventListener("resize",position);window.addEventListener("scroll",position,true);
  return ()=>{observer.disconnect();if(popup?.hidePopover&&popup.matches(":popover-open"))popup.hidePopover();document.removeEventListener("mousedown",dismiss);window.removeEventListener("resize",position);window.removeEventListener("scroll",position,true);};
 },[open]);
 useEffect(()=>{if(open&&section==="days"&&focusDate)panel.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();},[open,focusDate,view,section]);
 function change(next:string){if(value===undefined)setInternal(next);onChange?.(next);}
 function close(){setOpen(false);input.current?.focus();}
 function openCalendar(){if(disabled)return;const date=selected||new Date();setView(new Date(date.getFullYear(),date.getMonth(),1));setFocusDate(dateValue(date));setSection("days");setOpen(true);}
 function select(date:Date){
  if(mode==="datetime"){const time=selected||new Date();date.setHours(time.getHours(),time.getMinutes());change(dateTimeValue(date));}
  else{change(dateValue(date));close();}
 }
 function chooseMonth(month:number){
  const day=Math.min(selected?.getDate()||1,new Date(view.getFullYear(),month+1,0).getDate());
  setView(new Date(view.getFullYear(),month,1));setFocusDate(dateValue(new Date(view.getFullYear(),month,day)));setSection("days");
 }
 function chooseYear(year:number){setView(new Date(year,view.getMonth(),1));setSection("months");}
 function setTime(hours:number,minutes:number){
  const date=selected||parsed(focusDate)||new Date(view);date.setHours(hours,minutes);change(dateTimeValue(date));
 }
 function navigate(event:KeyboardEvent<HTMLButtonElement>,date:Date){
  const steps:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
  if(event.key in steps)date.setDate(date.getDate()+steps[event.key]);
  else if(event.key==="Home")date.setDate(date.getDate()-date.getDay());
  else if(event.key==="End")date.setDate(date.getDate()+6-date.getDay());
  else if(event.key==="PageUp"||event.key==="PageDown"){const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+(event.key==="PageUp"?-1:1));date.setDate(Math.min(day,new Date(date.getFullYear(),date.getMonth()+1,0).getDate()));}
  else return;
  event.preventDefault();setView(new Date(date.getFullYear(),date.getMonth(),1));setFocusDate(dateValue(date));
 }
 function quick(option:NonNullable<CalendarPickerProps["quickOptions"]>[number]){
  const date=new Date();const offsets={today:0,tomorrow:1,now:0,"+7d":7,"+14d":14,"+30d":30};
  date.setDate(date.getDate()+(option.offsetDays??offsets[option.special||"today"]));
  if(mode==="datetime"&&option.special!=="now"&&selected)date.setHours(selected.getHours(),selected.getMinutes());
  change(mode==="datetime"?dateTimeValue(date):dateValue(date));close();
 }
 const options=quickOptions??[{label:"Today",special:"today"},{label:"Tomorrow",special:"tomorrow"},{label:"+7 days",special:"+7d"},{label:"+30 days",special:"+30d"}];
 const first=new Date(view.getFullYear(),view.getMonth(),1);first.setDate(first.getDate()-first.getDay());
 const activeDate=focusDate&&parsed(focusDate)?.getMonth()===view.getMonth()?focusDate:dateValue(view);
 const yearStart=Math.floor(view.getFullYear()/12)*12;
 const hours=selected?.getHours()??9,minutes=selected?.getMinutes()??0;
 const monthNames=Array.from({length:12},(_,index)=>new Date(2026,index,1).toLocaleDateString(undefined,{month:"long"}));
 return <div ref={root} className={`calendar-picker-root ${className}`} onKeyDown={event=>{if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();if(section!=="days")setSection("days");else close();}}}>
  <div className="calendar-input-wrapper"><input className="calendar-text-input" ref={input} id={inputId} name={name} type="text" value={current} required={required} disabled={disabled} placeholder={placeholder||(mode==="datetime"?"YYYY-MM-DDTHH:mm":mode==="timeline"?"Date or timeframe":"YYYY-MM-DD")} onChange={event=>change(event.target.value)} onBlur={()=>setTouched(true)} onInvalid={()=>setTouched(true)} onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();openCalendar();}}} aria-label={ariaLabel||placeholder||name||"Date"} aria-invalid={touched&&Boolean(validation)} aria-describedby={touched&&validation?`${inputId}-error`:undefined}/>{current&&!disabled&&<button type="button" className="calendar-icon-button" aria-label="Clear date" onClick={()=>{change("");input.current?.focus();}}><X size={14}/></button>}<button type="button" className="calendar-icon-button" aria-label="Open calendar" aria-haspopup="dialog" aria-controls={`${inputId}-calendar`} aria-expanded={open} disabled={disabled} onClick={()=>open?close():openCalendar()}>{mode==="datetime"?<Clock size={15}/>:<Calendar size={15}/>}</button></div>
  {touched&&validation&&<small className="field-error" id={`${inputId}-error`}>{validation}</small>}
  {open&&!disabled&&<div ref={panel} popover="manual" id={`${inputId}-calendar`} role="dialog" aria-label="Choose a date" className="calendar-popover-panel" style={{top:placement.top,left:placement.left,maxHeight:placement.maxHeight}}>
   <div className="calendar-panel-top"><span>{section==="months"?"Choose month":section==="years"?"Choose year":section==="time"?"Choose time":"Choose date"}</span><button type="button" className="calendar-icon-button" aria-label="Close calendar" onClick={close}><X size={16}/></button></div>
   <div className="calendar-heading"><button type="button" className="calendar-icon-button" aria-label={section==="years"?"Previous years":"Previous month"} onClick={()=>setView(new Date(view.getFullYear()-(section==="years"?12:0),view.getMonth()-(section==="years"?0:1),1))}><ChevronLeft size={15}/></button><div className="calendar-period-controls"><button type="button" aria-label="Choose month" onClick={()=>setSection(section==="months"?"days":"months")}>{monthNames[view.getMonth()]}<ChevronDown size={12}/></button><button type="button" aria-label="Choose year" onClick={()=>{setYearDraft(String(view.getFullYear()));setSection(section==="years"?"days":"years");}}>{view.getFullYear()}<ChevronDown size={12}/></button></div><button type="button" className="calendar-icon-button" aria-label={section==="years"?"Next years":"Next month"} onClick={()=>setView(new Date(view.getFullYear()+(section==="years"?12:0),view.getMonth()+(section==="years"?0:1),1))}><ChevronRight size={15}/></button></div>
   {section==="months"&&<div className="calendar-choice-grid" role="group" aria-label="Months">{monthNames.map((month,index)=><button type="button" key={month} aria-pressed={index===view.getMonth()} onClick={()=>chooseMonth(index)}>{month}</button>)}</div>}
   {section==="years"&&<><div className="calendar-year-jump"><span>Go to year</span><input aria-label="Go to year" id={`${inputId}-year`} type="number" min={100} max={9999} value={yearDraft} onChange={event=>setYearDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();const year=Number(yearDraft);if(Number.isInteger(year)&&year>=100&&year<=9999)chooseYear(year);}}}/><button type="button" onClick={()=>{const year=Number(yearDraft);if(Number.isInteger(year)&&year>=100&&year<=9999)chooseYear(year);}}>Go</button></div><div className="calendar-choice-grid" role="group" aria-label="Years">{Array.from({length:12},(_,index)=>yearStart+index).map(year=><button type="button" key={year} aria-pressed={year===view.getFullYear()} onClick={()=>chooseYear(year)}>{year}</button>)}</div></>}
   {section==="days"&&<>
   <div className="calendar-weekdays" aria-hidden="true">{["Su","Mo","Tu","We","Th","Fr","Sa"].map(day=><span key={day}>{day}</span>)}</div>
   <div className="calendar-days" role="group" aria-label="Days. Use arrow keys to move, Enter to choose, and Escape to close.">{Array.from({length:42},(_,index)=>{const date=new Date(first);date.setDate(first.getDate()+index);const key=dateValue(date),chosen=selected&&dateValue(selected)===key;return <button key={key} data-date={key} type="button" tabIndex={key===activeDate?0:-1} aria-label={date.toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"})} disabled={Boolean((min&&key<min.slice(0,10))||(max&&key>max.slice(0,10)))} aria-pressed={Boolean(chosen)} aria-current={key===dateValue(new Date())?"date":undefined} className={`${chosen?"calendar-selected":""} ${date.getMonth()!==view.getMonth()?"calendar-outside":""}`} onClick={()=>select(date)} onKeyDown={event=>navigate(event,new Date(date))}>{date.getDate()}</button>;})}</div>
   </>}
   {section==="time"&&<div className="calendar-time-panel"><div className="calendar-time"><span>Exact time</span><input type="time" aria-label="Time" value={`${pad(hours)}:${pad(minutes)}`} onChange={event=>{if(event.target.value){const [h,m]=event.target.value.split(":").map(Number);setTime(h,m);}}}/></div><span>Hour</span><div className="calendar-time-grid" role="group" aria-label="Hours">{Array.from({length:24},(_,hour)=><button type="button" key={hour} aria-label={`Hour ${pad(hour)}`} aria-pressed={hour===hours} onClick={()=>setTime(hour,minutes)}>{pad(hour)}</button>)}</div><span>Minute</span><div className="calendar-time-grid" role="group" aria-label="Minutes">{Array.from({length:12},(_,index)=>index*5).map(minute=><button type="button" key={minute} aria-label={`Minute ${pad(minute)}`} aria-pressed={minute===minutes} onClick={()=>setTime(hours,minute)}>{pad(minute)}</button>)}</div></div>}
   {mode==="datetime"&&<button type="button" className="calendar-time-toggle" onClick={()=>setSection(section==="time"?"days":"time")}><Clock size={15}/><span>{section==="time"?"Back to dates":"Choose time"}</span><strong>{pad(hours)}:{pad(minutes)}</strong></button>}

   <div className="calendar-presets">{options.map(option=><button className="button button-quiet" type="button" key={option.label} onClick={()=>quick(option)}>{option.label}</button>)}{mode==="datetime"&&<button className="button button-quiet" type="button" onClick={()=>quick({label:"Now",special:"now"})}>Now</button>}<button className="button button-primary" type="button" onClick={close}>Done</button></div>
  </div>}
 </div>;
}
