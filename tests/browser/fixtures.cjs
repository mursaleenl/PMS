const fs=require('node:fs');
const adminId='00000000-0000-0000-0000-000000000001';
const employeeId='00000000-0000-0000-0000-000000000002';
const leadId='10000000-0000-0000-0000-000000000001';
const projectId='20000000-0000-0000-0000-000000000001';
const now='2026-10-29T09:00:00.000Z';
const tables={
 workspace_members:[{id:'member-admin',user_id:adminId,email:'admin@example.com',display_name:'Alex Morgan',role:'admin',created_at:now,must_change_password:false},{id:'member-employee',user_id:employeeId,email:'jordan@example.com',display_name:'Jordan Lee',role:'employee',created_at:now}],
 leads:[{id:leadId,external_id:'LEAD-TEST-001',full_name:'Sam Taylor',company_name:'Northstar Studio',email:'sam@example.com',services:['Website','UI/UX'],industry:'Professional Services',description:'A clearer home for the next chapter of our business.',urgency:'Standard',status:'NEW',operating_company:'Evecture',created_at:now,revision:0}],
 projects:[{id:projectId,external_id:'EVE-2026-001',lead_id:leadId,title:'Northstar website redesign',client_company:'Northstar Studio',client_name:'Sam Taylor',client_email:'sam@example.com',operating_company:'Evecture',services:['Website','UI/UX'],classification:'New Client',start_date:'2026-10-20',billing_structure:'Fixed',contracted_value:12000,currency:'USD',scope_included:'Strategy, design and development',revision_rounds:2,status:'ACTIVE',created_at:now,revision:0},{id:'20000000-0000-0000-0000-000000000002',external_id:'EVE-2026-002',title:'Customer experience platform',client_company:'Atlas & Co',client_name:'Morgan',client_email:'morgan@example.com',operating_company:'Servn',services:['CRM'],classification:'New Client',billing_structure:'Fixed',contracted_value:18000,currency:'USD',status:'ACTIVE',revision_rounds:2,created_at:now,revision:0}],
 project_team_members:[{id:'team1',project_id:projectId,role:'Project Manager',name:'Alex Morgan',allocation_percent:40},{id:'team2',project_id:projectId,role:'Lead Developer',name:'Jordan Lee',allocation_percent:80}],
 project_work_items:[{id:'work1',external_id:'TASK1',project_id:projectId,title:'Build the homepage experience',kind:'FEATURE_DEV',assignee_name:'Jordan Lee',status:'IN_PROGRESS',priority:'P2',estimated_hours:12,logged_hours:4,created_at:now},{id:'work2',external_id:'TASK2',project_id:projectId,title:'Review navigation and content structure',kind:'FEATURE_DEV',assignee_name:'Alex Morgan',status:'TO_DO',priority:'P3',estimated_hours:3,logged_hours:0,created_at:now},{id:'work3',external_id:'TASK3',project_id:projectId,title:'Approve the visual direction',kind:'CLIENT_FEEDBACK_TODO',assignee_name:'Alex Morgan',status:'DONE',priority:'P2',estimated_hours:3,logged_hours:2,created_at:now}],
 invoices:[{id:'invoice1',invoice_number:'EVE-INV-2026-001',lead_id:leadId,project_id:projectId,operating_company:'Evecture',bill_to:'Northstar Studio',client_name:'Sam Taylor',description:'Website project deposit',quantity:1,unit_price:2400,subtotal:2400,gst_enabled:false,gst_rate:0,gst_amount:0,total:2400,issue_date:'2026-10-20',due_date:'2026-10-27',contract_value:12000,deposit_percent:20,deposit_amount:2400,currency:'USD',status:'SENT',is_deposit:true,created_at:now,updated_at:now,revision:0}],
 managed_projects:[{id:'managed1',external_id:'RET-2026-001',project_title:'Website care & support',client_company:'Northstar Studio',model:'Annual maintenance',management_amount:450,currency:'USD',billing_cycle:'Monthly',period_start:'2026-10-01',status:'ACTIVE',created_at:now,revision:0}],
 proposals:[],proposal_follow_ups:[],project_links:[],attendance_records:[],
};
async function mockWorkspace(page,{role='admin',preview=false}={}){
 const env=fs.readFileSync(fs.existsSync('.env.local')?'.env.local':'.env','utf8');
 const urlLine=env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$/m);
 if(!urlLine)throw new Error('Supabase URL is required to run browser fixtures.');
 const url=urlLine[1].trim().replace(/^['"]|['"]$/g,'');
 const storageKey=`sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
 const user={id:adminId,email:'admin@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Alex Morgan'},created_at:now};
 const token=[{alg:'HS256',typ:'JWT'},{sub:adminId,exp:Math.floor(Date.now()/1000)+36000,role:'authenticated',email:user.email}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.test-signature';
 await page.addInitScript(({storageKey,token,user})=>{localStorage.setItem(storageKey,JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+36000,expires_in:36000,token_type:'bearer',user}));},{storageKey,token,user});
 const calls=[];
 await page.route(`${new URL(url).origin}/**`,async route=>{
  const request=route.request(),target=new URL(request.url());
  if(target.pathname.includes('/auth/'))return route.fulfill({json:user});
  if(target.pathname.includes('/rpc/save_workspace_changes')){
   const body=request.postDataJSON();calls.push(body);
   return route.fulfill({json:Object.fromEntries(body.p_changes.map(change=>[`${change.collection}:${change.id}`,change.expectedRevision===null?0:change.expectedRevision+1]))});
  }
  if(target.pathname.includes('/rpc/workspace_schema_version'))return route.fulfill({json:1});
  if(target.pathname.includes('/rpc/reserve_workspace_number'))return route.fulfill({json:'EVE-INV-2026-002'});
  const table=target.pathname.split('/').pop();
  if(table==='attendance_settings')return route.fulfill({json:{office_name:"Main office",timezone:"Asia/Kolkata"}});
  if(table==='attendance_sessions'&&target.searchParams.has('checked_out_at'))return route.fulfill({json:null});
  let data=structuredClone(tables[table]??[]);
  if(table==='workspace_members'&&target.searchParams.has('user_id'))data=[{...data[0],role}];
  if(preview)for(const row of data)delete row.revision;
  return route.fulfill({json:data});
 });
 await page.route('**/api/assignees',route=>route.fulfill({json:{assignees:[{id:adminId,name:'Alex Morgan',email:'admin@example.com',role:'admin'},{id:employeeId,name:'Jordan Lee',email:'jordan@example.com',role:'employee'}]}}));
 await page.route('https://open.er-api.com/**',route=>route.fulfill({json:{result:'success',rates:{USD:1,INR:95,EUR:0.92,GBP:0.79}}}));
 return {calls};
}
module.exports={mockWorkspace,tables};
