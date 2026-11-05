"use client";
import {readLeads,updateLead} from './leads';
import {flushWorkspaceChanges} from './workspace-sync';
import {isValidDateValue} from './dates';
export async function sendProposalToClient(leadId:string,version:number){
 const lead=readLeads().find(item=>item.id===leadId);
 const proposal=lead?.proposals?.find(item=>item.version===version);
 if(!lead||!proposal||lead.status==='LOST'||!['DRAFT','SENT'].includes(proposal.status))throw new Error('This proposal is not available to send.');
 if(proposal.expiryDate&&(!isValidDateValue(proposal.expiryDate)||proposal.expiryDate<new Date().toISOString().slice(0,10)))throw new Error('Update the expiry date before sending this proposal.');
 if(proposal.status==='DRAFT'){
  const now=new Date().toISOString();
  updateLead(lead.id,{status:['ACCEPTED','CONVERTED'].includes(lead.status)?lead.status:'PROPOSAL_SENT',proposals:lead.proposals!.map(item=>item.version===version?{...item,status:'SENT',sentAt:now}:['SENT','CHANGES_REQUESTED'].includes(item.status)?{...item,status:'SUPERSEDED'}:item)});
 }
 await flushWorkspaceChanges();
 return readLeads().find(item=>item.id===leadId)!;
}
