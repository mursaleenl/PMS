import Link from "next/link";
import { ArrowRight, ListTodo, User } from "lucide-react";
import { ProjectCardLogo } from "@/app/_components/project-card-logo";
import { StatusBadge } from "@/app/_components/status-badge";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignees";
import { canViewProjectTask, getProjectClientLabel, getProjectDisplayServices, getProjectDisplayTitle, type Project } from "@/lib/projects";
import type { WorkspaceRole } from "@/lib/roles";

type ProjectPortfolioCardProps = {
  project: Project;
  role: WorkspaceRole;
  userId?: string;
  employeeName: string;
  heading?: "h2" | "h3";
};

export function ProjectPortfolioCard({ project, role, userId, employeeName, heading: Heading = "h2" }: ProjectPortfolioCardProps) {
  const internal = project.projectType === "internal";
  const company = project.operatingCompany ?? "Evecture";
  const title = getProjectDisplayTitle(project);
  const subtitle = (!internal && getProjectClientLabel(project)) || getProjectDisplayServices(project);
  const href = `/projects/${project.id}`;
  const openWork = (project.workItems ?? []).filter(task => task.status !== "DONE" && canViewProjectTask(project, task, role, userId, employeeName)).length;
  const manager = project.team.find(member => member.role === "Project Manager")?.name;
  const pmName = manager && !DUMMY_ASSIGNABLE_NAMES.has(manager.toLowerCase().trim()) ? manager : "PM unassigned";

  return <article className="portfolio-card panel">
    <Link className="portfolio-card-link" href={href}>
      <div className="portfolio-card-top">
        <span>
          {internal ? <span className="project-internal-wordmark">Internal</span> : <span className={`company-pill company-${company.toLowerCase()}`} data-company={company}>{company}</span>}
        </span>
        <StatusBadge status={project.status} />
      </div>
      <div className="portfolio-project-identity">
        <ProjectCardLogo src={project.logoDataUrl} title={title} projectType={project.projectType} />
        <div className="portfolio-project-copy">
          <Heading className="portfolio-card-title">{title}</Heading>
          {subtitle && <p className="portfolio-card-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="portfolio-task-row">
        <ListTodo className="task-count-icon" size={16} strokeWidth={2} aria-hidden="true"/>
        <span>{openWork} open {openWork === 1 ? "task" : "tasks"}</span>
      </div>
      <div className="portfolio-card-meta">
        <span className="portfolio-pm-chip" title={`Project Manager: ${pmName}`}>
          <User size={12} />
          <span>{pmName}</span>
        </span>
        <span className="portfolio-id-badge">
          <span className="mono-meta">{project.id}</span>
          <ArrowRight size={13} className="portfolio-arrow-icon" />
        </span>
      </div>
    </Link>
    <div className="portfolio-actions portfolio-actions-admin">
      <Link className="button button-quiet portfolio-lifecycle-button" href={href}>
        Explore<ArrowRight size={13} />
      </Link>
    </div>
  </article>;
}
