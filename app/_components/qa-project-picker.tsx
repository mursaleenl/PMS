"use client";
import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import {Check,ChevronDown,Search} from "lucide-react";
import {getProjectClientLabel,getProjectDisplayTitle,type Project} from "@/lib/projects";
export function QaProjectPicker({projects,value,onChange,disabled=false}:{projects:Project[];value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[search,setSearch]=useState(""),[position,setPosition]=useState({top:0,left:0,width:280,maxHeight:300});
 const selected=projects.find(project=>project.id===value),title=selected?getProjectDisplayTitle(selected):"General report",organization=selected?getProjectClientLabel(selected):"No associated project";
 const options=[{id:"",title:"General report",organization:"No associated project"},...projects.map(project=>({id:project.id,title:getProjectDisplayTitle(project),organization:getProjectClientLabel(project)||"Internal project"}))].filter(option=>`${option.title} ${option.organization}`.toLowerCase().includes(search.toLowerCase().trim()));
 function close(){setOpen(false);trigger.current?.focus();}
 useEffect(()=>{
  if(!open)return;
  const bounds=trigger.current!.getBoundingClientRect(),width=Math.min(Math.max(bounds.width,280),window.innerWidth-32),below=window.innerHeight-bounds.bottom-16,above=bounds.top-16,openBelow=below>=Math.min(240,above),height=Math.min(300,openBelow?below:above);
  setPosition({top:openBelow?bounds.bottom+6:Math.max(16,bounds.top-height-6),left:Math.max(16,Math.min(bounds.left,window.innerWidth-width-16)),width,maxHeight:height});
  const node=panel.current;node?.showPopover();node?.querySelector('input')?.focus();
  const reposition=()=>{setOpen(false);};window.addEventListener('resize',reposition);
  return()=>{window.removeEventListener('resize',reposition);if(node?.isConnected&&node.matches(':popover-open'))node.hidePopover();};
 },[open]);
 function navigate(event:KeyboardEvent<HTMLElement>){
  if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key==="Enter"&&event.target instanceof HTMLInputElement){event.preventDefault();panel.current?.querySelector<HTMLButtonElement>('[role=option]')?.click();return;}
  if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
  const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role=option]')??[]);if(!buttons.length)return;
  event.preventDefault();const current=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?Math.min(current+1,buttons.length-1):Math.max(0,current-1);buttons[next].focus();
 }
 return <div className="qa-project-picker" ref={root}><span id={`${id}-label`}>Project (optional)</span><button ref={trigger} disabled={disabled} className="qa-project-trigger" type="button" role="combobox" aria-label="Project" aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-options`} onClick={()=>{setSearch("");setOpen(!open);}} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setSearch("");setOpen(true);}}}><span><strong>{title}</strong><small>{organization}</small></span><ChevronDown size={16}/></button>
 {open&&<div ref={panel} popover="auto" className="qa-project-popover" style={position} onToggle={event=>{if(!event.currentTarget.matches(':popover-open'))setOpen(false);}} onKeyDown={navigate}><label className="qa-project-search"><Search size={15}/><input aria-label="Search projects and organizations" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search projects or organizations"/></label><div id={`${id}-options`} role="listbox" aria-label="Projects">{options.map(option=><button type="button" key={option.id} role="option" aria-selected={option.id===value} onClick={()=>{onChange(option.id);close();}}><span><strong>{option.title}</strong><small>{option.organization}</small></span>{option.id===value&&<Check size={15}/>}</button>)}{!options.length&&<p>No matching projects</p>}</div></div>}
 </div>;
}
