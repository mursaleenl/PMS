"use client";
import {useState} from "react";
export type TaskTargetOption={id:string;label:string;detail?:string};
export function TaskTargetPicker({label,options,selected,onChange}:{label:string;options:TaskTargetOption[];selected:Set<string>;onChange:(value:Set<string>)=>void}){
 const [query,setQuery]=useState("");
 const filtered=options.filter(option=>`${option.label} ${option.detail||""}`.toLowerCase().includes(query.trim().toLowerCase()));
 const all=options.length>0&&options.every(option=>selected.has(option.id));
 return <fieldset className="task-target-picker"><legend>{label}<span>{selected.size} selected</span></legend><div className="task-target-tools"><input type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}`} value={query} onChange={event=>setQuery(event.target.value)}/><button type="button" className="button button-quiet" onClick={()=>onChange(all?new Set():new Set(options.map(option=>option.id)))}>{all?`Clear ${label.toLowerCase()}`:`Select all ${label.toLowerCase()}`}</button></div><div className="task-target-options" role="group" aria-label={label}>{filtered.map(option=><label key={option.id}><input type="checkbox" aria-label={option.label} checked={selected.has(option.id)} onChange={event=>{const next=new Set(selected);if(event.target.checked)next.add(option.id);else next.delete(option.id);onChange(next);}}/><span><strong>{option.label}</strong>{option.detail&&<small>{option.detail}</small>}</span></label>)}{!filtered.length&&<p>No matching {label.toLowerCase()}.</p>}</div></fieldset>;
}
