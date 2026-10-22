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
    <div className="assignment-card-heading"><div><span className="eyebrow">{project.id} · {project.clientCompany || project.clientName} · {project.operatingCompany ?? "Evecture"}</span><h2>{project.title}</h2><p>{project.services.join(", ")}</p></div><Link className="text-link" href={`/projects/${project.id}`}>Open project <ArrowRight size={14} /></Link></div>
    <form onSubmit={saveAssignments}>
      <div className="assignment-grid">{roles.map((role, index) => {
        const member = project.team.find((item) => item.role === role);
        const key = `role-${index}`;
        return <div className="assignment-editor-row" key={role}>
          <label className="field">{role}<input name={`${key}-name`} defaultValue={member?.name || ""} placeholder="Unassigned" required={role === "Project Manager"} /></label>
          <label className="field">Allocation %<input name={`${key}-allocation`} type="number" min="0" max="100" step="1" defaultValue={member?.allocationPercent || ""} placeholder="0" /></label>
        </div>;
      })}</div>
      <div className="assignment-card-footer"><span>Allocation is recorded per role; employee availability is not connected.</span><button className="button button-primary" type="submit">{saved ? <><Check size={14} />Saved</> : <><Users size={14} />Save assignments</>}</button></div>
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
  const roster = new Map<string, { roles: Set<string>; projects: Set<string>; allocation: number }>();
  active.forEach((project) => project.team.forEach((member) => {
    const name = member.name.trim();
    if (!name) return;
    const current = roster.get(name) ?? { roles: new Set<string>(), projects: new Set<string>(), allocation: 0 };
    current.roles.add(member.role);
    current.projects.add(project.title);
    current.allocation += member.allocationPercent;
    roster.set(name, current);
  }));
  const team = [...roster.entries()].sort(([left], [right]) => left.localeCompare(right));
  return <div className="page-content project-assignments-page">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot" />PROJECT DELIVERY · TEAM</div><h1>Team overview</h1><p className="welcome-subtitle">See who is assigned across projects and manage each project’s roles.</p></div><Link className="button button-quiet" href="/projects">Project portfolio <ArrowRight size={14} /></Link></section>
    {active.length === 0 ? <section className="panel pipeline-empty projects-empty"><span className="empty-icon"><Users size={22} /></span><h2>No projects to assign</h2><p>When a project workspace is created, its team roles can be assigned here.</p><Link className="button button-primary" href="/projects">Open project portfolio <ArrowRight size={15} /></Link></section> : <>
      <section className="team-roster-section"><div className="overview-section-heading"><div><h2>Team members</h2><p>{team.length} people assigned to {active.length} active projects</p></div><span className="team-roster-count"><Users size={14} />{team.length} members</span></div>
        {team.length === 0 ? <div className="panel team-roster-empty">No team members are assigned yet. Assign roles below to build the project roster.</div> : <div className="team-roster-grid">{team.map(([name, info]) => <article className="panel team-roster-card" key={name}><div className="team-roster-card-top"><span className="team-member-avatar">{name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}</span><span className="team-member-load">{info.allocation}%</span></div><h3>{name}</h3><p>{[...info.roles].join(" · ")}</p><div className="team-member-projects">{[...info.projects].slice(0, 2).map((title) => <span key={title}>{title}</span>)}{info.projects.size > 2 && <small>+{info.projects.size - 2} more</small>}</div><div className="team-member-card-footer"><span>{info.projects.size} {info.projects.size === 1 ? "project" : "projects"}</span><span className="team-load-track"><i style={{ width: `${Math.min(info.allocation, 100)}%` }} /></span></div></article>)}</div>}
      </section>
      <section className="team-assignment-section"><div className="overview-section-heading"><div><h2>Project assignments</h2><p>Update role ownership and planned allocation by project.</p></div></div><div className="assignment-card-list">{active.map((project) => <AssignmentCard key={project.id} project={project} />)}</div></section>
    </>}
    <p className="storage-note">Assignments update the project workspace immediately. Resource availability and team directory lookup will be connected later.</p>
  </div>;
}
