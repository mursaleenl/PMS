import type {ReactNode} from "react";
const success=new Set(["COMPLETED","DONE","PAID","CONFIRMED_PAID","ACCEPTED","CONVERTED","WON"]);
const danger=new Set(["BLOCKED","LOST","DISQUALIFIED","DECLINED","EXPIRED","OVERDUE","P1"]);
export function StatusBadge({status,children}:{status:string;children?:ReactNode}) {
 const key=status.trim().toUpperCase().replace(/[\s-]+/g,"_");
 const tone=success.has(key)?"success":danger.has(key)?"danger":"neutral";
 const label=status.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase());
 return <span className={`status-badge status-badge-${tone}`} data-status={key}>{children??label}</span>;
}
