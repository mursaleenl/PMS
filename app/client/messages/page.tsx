"use client";
import Link from "next/link";
import {Suspense,useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import {useClientWorkspace} from "@/lib/client-workspace";
import {ProjectConversation} from "@/app/_components/project-conversation";
function Messages() {
 const {projects,loading,error,retry}=useClientWorkspace();
 const search=useSearchParams();
 const [selected,setSelected]=useState(search.get("project")||"");
 useEffect(()=>{if(projects.length&&!projects.some(project=>project.external_id===selected))setSelected(projects[0].external_id);},[projects,selected]);
 return <div className="page-content role-dashboard-page"><Link className="back-link" href="/client">Client portal</Link><section className="welcome-row"><div><h1>Questions and updates</h1><p className="welcome-subtitle">Discuss delivery and change requests with your project team.</p></div></section>{loading?<p role="status">Loading projects…</p>:error?<section className="panel"><p role="alert">{error}</p><button className="button button-quiet" onClick={retry}>Retry</button></section>:projects.length?<section className="panel portal-record"><label className="field">Project<select value={selected} onChange={event=>setSelected(event.target.value)}>{projects.map(project=><option key={project.id} value={project.external_id}>{project.title}</option>)}</select></label>{selected&&<ProjectConversation key={selected} projectId={selected}/>}</section>:<section className="panel portal-record"><h2>No project conversations yet</h2><p>Conversations become available when your team starts a project.</p></section>}</div>;
}
export default function ClientMessagesPage(){return <Suspense fallback={<p>Loading conversations…</p>}><Messages/></Suspense>;}
