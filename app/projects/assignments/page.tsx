"use client";

import Link from "next/link";
import { ArrowRight, Check, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { readProjects, type Project, type ProjectTeamMember, updateProject } from "@/lib/projects";

const roles: ProjectTeamMember["role"][] = ["Project Manager", "Lead Designer", "Lead Developer", "QA Owner", "Supporting team member"];

function AssignmentCard({ project }: { project: Project }) {
  const [saved, setSaved] = useState(false);

  function saveAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const team = roles.map((role, index) => {
      const key = `role-${index}`;
      return {
        role,
        name: String(data.get(`${key}-name`) || "").trim(),
        allocationPercent: Number(data.get(`${key}-allocation`) || 0),
      };
    });
    updateProject(project.id, { team });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return <article className="panel assignment-card">
    <div className="assignment-card-heading"><div><span className="eyebrow">{project.id} · {project.clientCompany || project.clientName}</span><h2>{project.title}</h2><p>{project.services.join(", ")}</p></div><Link className="text-link" href={`/projects/${project.id}`}>Open project <ArrowRight size={14}/></Link></div>
    <form onSubmit={saveAssignments}>
      <div className="assignment-grid">{roles.map((role, index) => {
        const member = project.team.find((item) => item.role === role);
        const key = `role-${index}`;
        return <div className="assignment-editor-row" key={role}>
          <label className="field">{role}<input name={`${key}-name`} defaultValue={member?.name || ""} placeholder="Unassigned" required={role === "Project Manager"}/></label>
          <label className="field">Allocation %<input name={`${key}-allocation`} type="number" min="0" max="100" step="1" defaultValue={member?.allocationPercent || ""} placeholder="0"/></label>
        </div>;
      })}</div>
      <div className="assignment-card-footer"><span>Allocation is recorded per role; employee availability is not connected.</span><button className="button button-primary" type="submit">{saved ? <><Check size={14}/>Saved</> : <><Users size={14}/>Save assignments</>}</button></div>
    </form>
  </article>;
}

export default function ProjectAssignmentsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    const refresh = () => setProjects(readProjects());
    refresh();
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const active = projects.filter((project) => project.status === "ACTIVE");
  return <div className="page-content project-assignments-page">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/>PROJECT DELIVERY · TEAM</div><h1>Project assignments</h1><p className="welcome-subtitle">Assign employees to project roles and record their allocation.</p></div><Link className="button button-quiet" href="/projects">Project portfolio <ArrowRight size={14}/></Link></section>
    {active.length === 0 ? <section className="panel pipeline-empty projects-empty"><span className="empty-icon"><Users size={22}/></span><h2>No projects to assign</h2><p>When a project workspace is created, its team roles can be assigned here.</p><Link className="button button-primary" href="/projects">Open project portfolio <ArrowRight size={15}/></Link></section> : <div className="assignment-card-list">{active.map((project) => <AssignmentCard key={project.id} project={project}/>)}</div>}
    <p className="storage-note">Assignments update the project workspace immediately. Resource availability and team directory lookup will be connected later.</p>
  </div>;
}
