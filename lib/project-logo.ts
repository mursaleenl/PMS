export const DEFAULT_INTERNAL_PROJECT_LOGO = "/internal-project-logo.png";

export function getProjectLogoSrc(project: { logoDataUrl?: string | null; projectType?: string }): string | undefined {
  return project.logoDataUrl || (project.projectType === "internal" ? DEFAULT_INTERNAL_PROJECT_LOGO : undefined);
}
