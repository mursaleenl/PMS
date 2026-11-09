type ServiceProject = { title: string; clientCompany?: string; clientName?: string; services?: string[] };
const serviceNames = new Map(['Branding', 'Website', 'E-commerce', 'UI/UX', 'CRM', 'Custom Request'].map(name => [name.toLowerCase(), name]));

/** An explicit service-only project title narrows the original enquiry's services. */
export function getProjectServices(project: ServiceProject): string[] {
  const identities = [project.clientCompany, project.clientName].filter(Boolean) as string[];
  const clean = (value: string) => {
    for (const identity of identities) {
      const escaped = identity.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      value = value.replace(new RegExp(`^${escaped}\\s*[·—–|:-]\\s*`, 'i'), '');
    }
    return value.trim();
  };
  const split = (value: string) => clean(value).split(/\s*(?:,|&|\+|\band\b)\s*/i).map(part => part.trim()).filter(Boolean);
  const titleParts = split(project.title);
  const explicit = titleParts.length > 0 && titleParts.every(part => serviceNames.has(part.toLowerCase()));
  const values = explicit ? titleParts : (project.services ?? []).flatMap(split);
  const seen = new Set<string>();
  return values.filter(value => {
    const key = value.toLowerCase();
    if (key === 'multiple' || identities.some(identity => identity.trim().toLowerCase() === key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(value => serviceNames.get(value.toLowerCase()) ?? value);
}

/** Project invoices inherit authored scope before falling back to service labels. */
export function getInheritedInvoiceDescription(project: ServiceProject & {scopeIncluded?: string}, lead?: {description?: string}): string {
  return project.scopeIncluded?.trim() || lead?.description?.trim() || getProjectServices(project).join(", ") || project.title.trim() || "Project services";
}
