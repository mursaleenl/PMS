"use client";
import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import {Calendar,ChevronLeft,ChevronRight,Clock,X} from "lucide-react";
import {isValidDateValue} from "@/lib/dates";
export interface CalendarPickerProps {
 value?:string;defaultValue?:string;onChange?:(value:string)=>void;name?:string;id?:string;placeholder?:string;required?:boolean;disabled?:boolean;
 mode?:"date"|"datetime"|"timeline";className?:string;ariaLabel?:string;
 quickOptions?:Array<{label:string;offsetDays?:number;special?:"today"|"tomorrow"|"now"|"+7d"|"+14d"|"+30d"}>;
}
const pad=(value:number)=>String(value).padStart(2,"0");
function dateValue(date:Date){return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;}
function dateTimeValue(date:Date){return `${dateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
function parsed(value:string){
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&isValidDateValue(value)){const [y,m,d]=value.split("-").map(Number);return new Date(y,m-1,d);}
 if(!value.includes("T"))return null;
 const date=new Date(value);return Number.isNaN(date.getTime())?null:date;
}
function normalize(value:string,mode:string){const date=mode==="datetime"?parsed(value):null;return date?dateTimeValue(date):value;}
export function CalendarPicker({value,defaultValue="",onChange,name,id,placeholder,required=false,disabled=false,mode="date",className="",quickOptions,ariaLabel}:CalendarPickerProps){
 const generated=useId(),inputId=id||generated;
 const [internal,setInternal]=useState(()=>normalize(defaultValue,mode));
 const current=normalize(value===undefined?internal:value,mode);
 const selected=parsed(current);
 const input=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[touched,setTouched]=useState(false),[up,setUp]=useState(false),[right,setRight]=useState(false);
 const [view,setView]=useState(()=>{const date=selected||new Date();return new Date(date.getFullYear(),date.getMonth(),1);});
 const [focusDate,setFocusDate]=useState("");
 const invalid=Boolean(current)&&mode!=="timeline"&&!isValidDateValue(current,mode==="datetime");
 const validation=invalid?`Enter a valid ${mode==="datetime"?"date and time (YYYY-MM-DDTHH:mm)":"date (YYYY-MM-DD)"}.`:required&&!current?"Choose a date.":"";
 useEffect(()=>{input.current?.setCustomValidity(validation);},[validation]);
 useEffect(()=>{
  if(!open)return;
  const dismiss=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false);};
  const position=()=>{if(!root.current)return;const box=root.current.getBoundingClientRect();const height=panel.current?.offsetHeight||370;setUp(window.innerHeight-box.bottom<height&&box.top>window.innerHeight-box.bottom);setRight(window.innerWidth-box.left<300);};
  position();document.addEventListener("mousedown",dismiss);window.addEventListener("resize",position);window.addEventListener("scroll",position,true);
  return ()=>{document.removeEventListener("mousedown",dismiss);window.removeEventListener("resize",position);window.removeEventListener("scroll",position,true);};
 },[open]);
 useEffect(()=>{if(open&&focusDate)panel.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();},[open,focusDate,view]);
 function change(next:string){if(value===undefined)setInternal(next);onChange?.(next);}
 function close(){setOpen(false);input.current?.focus();}
 function openCalendar(){if(disabled)return;const date=selected||new Date();setView(new Date(date.getFullYear(),date.getMonth(),1));setFocusDate(dateValue(date));setOpen(true);}
 function select(date:Date){
  if(mode==="datetime"){const time=selected||new Date();date.setHours(time.getHours(),time.getMinutes());change(dateTimeValue(date));}
  else{change(dateValue(date));close();}
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
 return <div ref={root} className={`calendar-picker-root ${className}`} onKeyDown={event=>{if(event.key==="Escape"&&open){event.preventDefault();close();}}}>
  <div className="calendar-input-wrapper"><input className="calendar-text-input" ref={input} id={inputId} name={name} type="text" value={current} required={required} disabled={disabled} placeholder={placeholder||(mode==="datetime"?"YYYY-MM-DDTHH:mm":mode==="timeline"?"Date or timeframe":"YYYY-MM-DD")} onChange={event=>change(event.target.value)} onBlur={()=>setTouched(true)} onInvalid={()=>setTouched(true)} onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();openCalendar();}}} aria-label={ariaLabel||placeholder||name||"Date"} aria-invalid={touched&&Boolean(validation)} aria-describedby={touched&&validation?`${inputId}-error`:undefined}/>{current&&!disabled&&<button type="button" className="calendar-icon-button" aria-label="Clear date" onClick={()=>{change("");input.current?.focus();}}><X size={14}/></button>}<button type="button" className="calendar-icon-button" aria-label="Open calendar" aria-haspopup="dialog" aria-controls={`${inputId}-calendar`} aria-expanded={open} disabled={disabled} onClick={()=>open?close():openCalendar()}>{mode==="datetime"?<Clock size={15}/>:<Calendar size={15}/>}</button></div>
  {touched&&validation&&<small className="field-error" id={`${inputId}-error`}>{validation}</small>}
  {open&&!disabled&&<div ref={panel} id={`${inputId}-calendar`} role="dialog" aria-label="Choose a date" className={`calendar-popover-panel ${up?"popover-up":""} ${right?"popover-align-right":""}`}>
   <div className="calendar-heading"><button type="button" className="calendar-icon-button" aria-label="Previous month" onClick={()=>setView(new Date(view.getFullYear(),view.getMonth()-1,1))}><ChevronLeft size={15}/></button><strong aria-live="polite">{view.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</strong><button type="button" className="calendar-icon-button" aria-label="Next month" onClick={()=>setView(new Date(view.getFullYear(),view.getMonth()+1,1))}><ChevronRight size={15}/></button></div>
   <div className="calendar-weekdays" aria-hidden="true">{["Su","Mo","Tu","We","Th","Fr","Sa"].map(day=><span key={day}>{day}</span>)}</div>
   <div className="calendar-days" role="group" aria-label="Days. Use arrow keys to move, Enter to choose, and Escape to close.">{Array.from({length:42},(_,index)=>{const date=new Date(first);date.setDate(first.getDate()+index);const key=dateValue(date),chosen=selected&&dateValue(selected)===key;return <button key={key} data-date={key} type="button" tabIndex={key===activeDate?0:-1} aria-label={date.toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"})} aria-pressed={Boolean(chosen)} aria-current={key===dateValue(new Date())?"date":undefined} className={`${chosen?"calendar-selected":""} ${date.getMonth()!==view.getMonth()?"calendar-outside":""}`} onClick={()=>select(date)} onKeyDown={event=>navigate(event,new Date(date))}>{date.getDate()}</button>;})}</div>
   {mode==="datetime"&&<label className="calendar-time">Time<input type="time" aria-label="Time" value={selected?`${pad(selected.getHours())}:${pad(selected.getMinutes())}`:"09:00"} onChange={event=>{if(!event.target.value)return;const date=selected||new Date(view);const [hours,minutes]=event.target.value.split(":").map(Number);date.setHours(hours,minutes);change(dateTimeValue(date));}}/></label>}
   <div className="calendar-presets">{options.map(option=><button className="button button-quiet" type="button" key={option.label} onClick={()=>quick(option)}>{option.label}</button>)}{mode==="datetime"&&<button className="button button-quiet" type="button" onClick={()=>quick({label:"Now",special:"now"})}>Now</button>}<button className="button button-primary" type="button" onClick={close}>Done</button></div>
  </div>}
 </div>;
}
