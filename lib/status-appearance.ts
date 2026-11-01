import {BadgeCheck,CircleAlert,CircleCheck,CircleDashed,CircleDot,CirclePause,CircleX,Clock3,Eye,FileText,FolderCheck,Inbox,ListTodo,LoaderCircle,MessageSquare,Send,ShieldCheck,TrendingUp,Wrench,type LucideIcon} from "lucide-react";

export const statusColors = {
  blue:"#1d4ed8",teal:"#0f766e",green:"#166534",violet:"#6d28d9",indigo:"#4338ca",amber:"#92400e",red:"#b91c1c",slate:"#475569",
} as const;
type Appearance={icon:LucideIcon;color:string;tone:string};
const appearances:Record<string,Appearance>={};
function register(statuses:string[],icon:LucideIcon,tone:keyof typeof statusColors) {
  for(const status of statuses)appearances[status]={icon,color:statusColors[tone],tone};
}
register(["NEW"],Inbox,"blue");
register(["OPEN","ACTIVE"],CircleDot,"blue");
register(["ON_TRACK"],TrendingUp,"teal");
register(["QUALIFIED"],ShieldCheck,"teal");
register(["CONVERTED","WON"],FolderCheck,"violet");
register(["COMPLETED","DONE","RESOLVED"],CircleCheck,"green");
register(["ACCEPTED","PAID","CONFIRMED_PAID"],BadgeCheck,"green");
register(["AMC"],Wrench,"indigo");
register(["TO_DO","TODO"],ListTodo,"slate");
register(["NOT_STARTED","UNREVIEWED"],CircleDashed,"slate");
register(["IN_PROGRESS"],LoaderCircle,"blue");
register(["UNDER_REVIEW","IN_REVIEW"],Eye,"violet");
register(["DRAFT","GENERATED"],FileText,"slate");
register(["SENT","PROPOSAL_SENT"],Send,"indigo");
register(["PENDING","AWAITING_PAYMENT","MARGIN_ALERT"],Clock3,"amber");
register(["PAUSED","ON_HOLD"],CirclePause,"amber");
register(["BLOCKED","BLOCKED_WORK","OVERDUE","NEEDS_ATTENTION"],CircleAlert,"red");
register(["LOST","DISQUALIFIED","DECLINED","CANCELLED","CANCELED","ENDED"],CircleX,"red");
register(["EXPIRED"],Clock3,"red");
register(["CHANGES_REQUESTED","REVISION_REQUESTED"],MessageSquare,"amber");
register(["SUPERSEDED"],FileText,"slate");
export function getStatusAppearance(status:string):Appearance {
  return appearances[status.trim().toUpperCase().replace(/[\s-]+/g,"_")] ?? {icon:CircleDot,color:statusColors.slate,tone:"slate"};
}
