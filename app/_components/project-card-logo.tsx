import { getProjectLogoSrc } from "@/lib/project-logo";

export function ProjectCardLogo({ src, title, projectType }: { src?: string | null; title: string; projectType?: string }) {
  const logo = getProjectLogoSrc({ logoDataUrl: src, projectType });
  if (!logo) return null;
  return <img className="project-card-logo" src={logo} alt={`${title} logo`} width={44} height={44} draggable={false} />;
}
