const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
const load=createLoader({'@/lib/supabase':{supabase:null},'@/lib/assignees':{DUMMY_ASSIGNABLE_NAMES:new Set()}});
const sync=load('lib/workspace-sync.ts');
const invoices=load('lib/invoices.ts');
const {workspaceChanges,rowToProposal}=load('lib/relational-sync.ts');
const {isValidDateValue}=load('lib/dates.ts');
global.window=new EventTarget();
test('project cards show the company once and deduplicate service descriptions',()=>{
 const {getProjectDisplayTitle,getProjectDisplayServices}=load('lib/projects.ts');
 const project={title:'ZeroGrid LLC — Branding, Website',clientCompany:'ZeroGrid LLC',clientName:'Contact',services:['ZeroGrid LLC','ZeroGrid LLC · Branding, Website','CRM','Branding','Multiple']};
 assert.equal(getProjectDisplayTitle(project),'ZeroGrid LLC');
 assert.equal(getProjectDisplayServices(project),'Branding, Website, CRM, Multiple');
 assert.equal(getProjectDisplayServices({...project,services:['ZeroGrid LLC']}),'');
});
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

test('record IDs remain valid and unique when randomUUID is unavailable',()=>{
 const {createUuid}=load('lib/uuid.ts');
 const {webcrypto}=require('node:crypto');
 const provider={getRandomValues:bytes=>webcrypto.getRandomValues(bytes)};
 const ids=Array.from({length:1000},()=>createUuid(provider));
 assert.equal(new Set(ids).size,1000);
 for(const id of ids) assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(createUuid({randomUUID:()=> 'native-id'}),'native-id');
});

test('assigning work starts project tracking without changing completed or AMC projects',()=>{
 const {updateProject,readProjects}=load('lib/projects.ts');
 const base={id:'ASSIGN',title:'Assignment test',status:'ACTIVE',team:[],workItems:[]};
 const task={id:'assigned',assignee:'Employee',assigneeId:'employee-id',status:'TO_DO'};
 for(const status of ['ACTIVE','COMPLETED','AMC']) {
  sync.applyRemoteCollection('projects',[{...base,status}]);
  updateProject(base.id,{workItems:[task]});
  assert.equal(readProjects()[0].status,status==='ACTIVE'?'ON_TRACK':status);
 }
 sync.applyRemoteCollection('projects',[{...base,workItems:[task]}]);
 updateProject(base.id,{workItems:[{...task,status:'IN_PROGRESS'}]});
 assert.equal(readProjects()[0].status,'ACTIVE');
 sync.applyRemoteCollection('projects',[base]);
 updateProject(base.id,{workItems:[{...task,assignee:'',assigneeId:undefined}]});
 assert.equal(readProjects()[0].status,'ACTIVE');
});

test('status colours meet normal-text contrast on white and states have distinct icons',()=>{
 const {statusColors,getStatusAppearance}=load('lib/status-appearance.ts');
 const luminance=hex=>{
  const rgb=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
  return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
 };
 for(const [name,hex] of Object.entries(statusColors)) assert.ok(1.05/(luminance(hex)+0.05)>=4.5,`${name} must be legible on white`);
 assert.notEqual(getStatusAppearance('NEW').icon,getStatusAppearance('CONVERTED').icon);
 assert.notEqual(getStatusAppearance('ACTIVE').icon,getStatusAppearance('COMPLETED').icon);
 assert.equal(getStatusAppearance('On track').color,statusColors.teal);
});

test('retainer dates follow the selected cycle and clamp monthly anniversaries safely',()=>{
 const {calculateRetainerEndDate,retainerEndDate}=load('lib/retainer-dates.ts');
 assert.equal(calculateRetainerEndDate('2026-10-31','Monthly'),'2026-11-30');
 assert.equal(calculateRetainerEndDate('2026-01-31','Monthly'),'2026-02-28');
 assert.equal(calculateRetainerEndDate('2024-01-31','Monthly'),'2024-02-29');
 assert.equal(calculateRetainerEndDate('2026-11-30','Quarterly'),'2027-02-28');
 assert.equal(calculateRetainerEndDate('2024-02-29','Annual'),'2025-02-28');
 assert.equal(calculateRetainerEndDate('2026-02-30','Annual'),undefined);
 assert.equal(calculateRetainerEndDate('2026-10-31','One-time'),undefined);
 assert.equal(retainerEndDate({periodStart:'2026-10-31',periodEnd:'2027-12-31',model:'Annual maintenance',billingCycle:'Monthly'}),'2027-12-31');
});

test('retired qualification stages remain accessible without rewriting the saved history',()=>{
 seed();
 const {readLeads}=load('lib/leads.ts');
 const source=sync.localCollectionValue('leads').value[0];
 for(const [status,expected] of [['QUALIFIED','NEW'],['DISQUALIFIED','LOST']]){
  sync.applyRemoteCollection('leads',[{...source,status,qualification:{proposalAttachment:{name:'scope.pdf',dataUrl:'data:application/pdf;base64,JVBERg=='}}}]);
  assert.equal(readLeads()[0].status,expected);
  assert.equal(readLeads()[0].qualification.proposalAttachment.name,'scope.pdf');
  assert.equal(sync.localCollectionValue('leads').value[0].status,status);
 }
});

test('task assignments retain a unique project team without duplicating the manager',()=>{
 const {updateProject,readProjects,getProjectTeamMembers}=load('lib/projects.ts');
 const manager={role:'Project Manager',name:'Alex Manager',userId:'manager-id',allocationPercent:0};
 const base={id:'TEAM-PROJECT',title:'Team test',status:'ACTIVE',team:[manager],workItems:[]};
 const task={id:'team-task',assignee:'Jordan Employee',assigneeId:'employee-id',status:'TO_DO'};
 sync.applyRemoteCollection('projects',[base]);
 updateProject(base.id,{workItems:[task,{...task,id:'second-task'}]});
 let project=readProjects()[0];
 assert.equal(project.team.length,2);
 assert.deepEqual(getProjectTeamMembers(project).map(member=>member.userId),['employee-id']);
 assert.deepEqual(project.team[0],manager);
 updateProject(base.id,{workItems:[{...task,assignee:'Casey Employee',assigneeId:'casey-id'}]});
 project=readProjects()[0];
 assert.deepEqual(getProjectTeamMembers(project).map(member=>member.userId),['employee-id','casey-id']);
 updateProject(base.id,{workItems:[{...task,assignee:manager.name,assigneeId:manager.userId}]});
 assert.equal(readProjects()[0].team.length,3);
 assert.equal(getProjectTeamMembers(readProjects()[0]).length,2);
 const legacy={...base,team:[manager,{role:'Lead Developer',name:'Jordan Employee',allocationPercent:0}],workItems:[task,{...task,id:'same-person'}]};
 assert.equal(getProjectTeamMembers(legacy).length,1);
 sync.applyRemoteCollection('projects',[legacy]);
 updateProject(base.id,{workItems:legacy.workItems.map(item=>({...item,status:'DONE'}))});
 assert.deepEqual(readProjects()[0].team,legacy.team,'status-only updates must not change team membership');
});
