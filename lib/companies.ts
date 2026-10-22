export const operatingCompanies = ["Evecture", "Servn"] as const;
export type OperatingCompany = (typeof operatingCompanies)[number];
