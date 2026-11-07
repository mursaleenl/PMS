import type {CSSProperties,ReactNode} from "react";
import {getStatusAppearance} from "@/lib/status-appearance";

export function StatusBadge({status,children}:{status:string;children?:ReactNode}) {
 const key=status.trim().toUpperCase().replace(/[\s-]+/g,"_");
 const appearance=getStatusAppearance(key);
 const Icon=appearance.icon;
 const label=key==="CONVERTED"?"Won":key==="AMC"?"AMC":status.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase());
 return <span className="status-badge" data-status={key} data-tone={appearance.tone} style={{"--status-ink":appearance.color} as CSSProperties}><Icon size={15} strokeWidth={1.75} aria-hidden="true"/><span className="status-label">{children??label}</span></span>;
}
