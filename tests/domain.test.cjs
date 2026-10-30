const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
const load=createLoader({'@/lib/supabase':{supabase:null},'@/lib/assignees':{DUMMY_ASSIGNABLE_NAMES:new Set()}});
const sync=load('lib/workspace-sync.ts');
const invoices=load('lib/invoices.ts');
const {workspaceChanges,rowToProposal}=load('lib/relational-sync.ts');
const {isValidDateValue}=load('lib/dates.ts');
global.window=new EventTarget();
function seed(){
 sync.clearWorkspaceMemory();
 sync.applyRemoteCollection('leads',[{id:'L1',fullName:'Client',email:'client@example.com',companyName:'Company',services:[],status:'ACCEPTED',createdAt:'2026-10-01T00:00:00Z'}]);
 sync.applyRemoteCollection('projects',[{id:'P1',leadId:'L1',title:'Project',clientName:'Client',clientEmail:'client@example.com',clientCompany:'Company',team:[],status:'ACTIVE',billingStructure:'Fixed',classification:'New Client',contractedValue:1000,currency:'USD',createdAt:'2026-10-01T00:00:00Z'}]);
 sync.applyRemoteCollection('invoices',[]);
 sync.applyRemoteCollection('management',[]);
}
function invoice(id,overrides={}){return {id,invoiceNumber:id,projectId:'P1',leadId:'L1',billTo:'Company',operatingCompany:'Evecture',description:'Services',quantity:1,unitPrice:200,subtotal:200,gstEnabled:false,gstRate:0,gstAmount:0,total:200,issueDate:'2026-10-01',dueDate:'2026-10-15',contractValue:1000,depositPercent:20,depositAmount:200,currency:'USD',status:'GENERATED',createdAt:'2026-10-01T00:00:00Z',...overrides};}

test('invoice deletion remains deleted when UI subscribers immediately re-read',()=>{
 seed();invoices.saveInvoice(invoice('I1',{isDeposit:true}));
 const subscriber=()=>invoices.readInvoices();window.addEventListener('evecture:invoices-updated',subscriber);
 invoices.deleteInvoice('I1');
 assert.deepEqual(invoices.readInvoices(),[]);
 assert.equal(load('lib/leads.ts').readLeads()[0].invoice,undefined);
 window.removeEventListener('evecture:invoices-updated',subscriber);
});
test('milestone invoices preserve a paid deposit and deleting the deposit clears it',()=>{
 seed();invoices.saveInvoice(invoice('DEPOSIT',{isDeposit:true,status:'CONFIRMED_PAID'}));
 invoices.saveInvoice(invoice('MILESTONE',{total:300,unitPrice:300,subtotal:300,isDeposit:false}));
 let project=load('lib/projects.ts').readProjects()[0];
 assert.equal(project.depositStatus,'CONFIRMED_PAID');assert.equal(project.depositAmount,200);assert.equal(project.invoice.invoiceNumber,'DEPOSIT');
 invoices.deleteInvoice('DEPOSIT');project=load('lib/projects.ts').readProjects()[0];
 assert.equal(project.depositStatus,undefined);assert.equal(project.depositAmount,0);
});
test('snapshot diffs include only edited records and explicit deletions',()=>{
 seed();const before=sync.workspaceValues();
 const after=structuredClone(before);after.leads[0].fullName='Updated';
 const changes=workspaceChanges(before,after,{'leads:L1':0});
 assert.equal(changes.length,1);assert.equal(changes[0].id,'L1');assert.equal(changes[0].expectedRevision,0);
 after.leads=[];const deletion=workspaceChanges(before,after,{'leads:L1':0});
 assert.equal(deletion.length,1);assert.equal(deletion[0].operation,'delete');
});
test('derived invoice projections do not cause independent lead/project writes',()=>{
 seed();const before=sync.workspaceValues();invoices.saveInvoice(invoice('DEPOSIT',{isDeposit:true}));
 const changes=workspaceChanges(before,sync.workspaceValues(),{});
 assert.deepEqual(changes.map(change=>change.collection),['invoices']);
});
test('readers cannot mutate the shared snapshot and clearing removes previous-account data',()=>{
 seed();const copy=sync.localCollectionValue('leads').value;copy[0].email='changed';
 assert.equal(sync.localCollectionValue('leads').value[0].email,'client@example.com');
 sync.clearWorkspaceMemory();assert.equal(sync.localCollectionValue('leads').exists,false);
});
test('proposal response notes survive hydration',()=>{
 const proposal=rowToProposal({version:1,response_note:'Revise scope',response_name:'Client'},[]);
 assert.equal(proposal.changeRequest,'Revise scope');assert.equal(proposal.responseName,'Client');
});
test('date validation rejects impossible dates and times',()=>{
 assert.equal(isValidDateValue('2024-02-29'),true);assert.equal(isValidDateValue('2026-02-29'),false);
 assert.equal(isValidDateValue('2026-13-01'),false);assert.equal(isValidDateValue('2026-10-29T24:00',true),false);
 assert.equal(isValidDateValue('2026-10-29T23:59',true),true);assert.equal(isValidDateValue('nonsense'),false);
});
test('editable user metadata never grants an application role',()=>{
 const {getWorkspaceRole}=load('lib/roles.ts');
 assert.equal(getWorkspaceRole({email:'outsider@example.com',user_metadata:{role:'admin'}}),'client');
});
