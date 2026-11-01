import {isValidDateValue} from "@/lib/dates";
import type {ManagedProject,ManagementBillingCycle} from "@/lib/post-sale";

/** Calendar anniversaries are clamped to the last valid day of the target month. */
export function calculateRetainerEndDate(start:string,cycle:ManagementBillingCycle):string|undefined {
  if(!isValidDateValue(start))return undefined;
  const months=cycle==="Monthly"?1:cycle==="Quarterly"?3:cycle==="Annual"?12:0;
  if(!months)return undefined;
  const [year,month,day]=start.split("-").map(Number);
  const target=new Date(Date.UTC(year,month-1+months,1));
  const lastDay=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(day,lastDay));
  return target.toISOString().slice(0,10);
}
export function retainerEndDate(plan:Pick<ManagedProject,"periodStart"|"periodEnd"|"model"|"billingCycle">) {
  return plan.periodEnd || calculateRetainerEndDate(plan.periodStart,plan.billingCycle);
}
