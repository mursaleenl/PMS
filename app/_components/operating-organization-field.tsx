"use client";
import {operatingCompanies,type OperatingCompany} from "@/lib/companies";

export function OperatingOrganizationField({value,onChange,name,label="Operating organization",selectLabel,required=false}:{value?:OperatingCompany;onChange?:(value:OperatingCompany)=>void;name?:string;label?:string;selectLabel?:string;required?:boolean}){
  if(value)return <div className="field operating-organization-summary"><span>{label}</span><strong className="operating-organization-value" data-company={value}>{value}</strong></div>;
  return <label className={`field ${required?"required":""}`}>{label}<select name={name} aria-label={selectLabel||label} defaultValue="" required={required} onChange={event=>{const organization=event.target.value;if(operatingCompanies.some(value=>value===organization))onChange?.(organization as OperatingCompany);}}><option value="" disabled>Select an operating organization</option>{operatingCompanies.map(organization=><option key={organization}>{organization}</option>)}</select></label>;
}
