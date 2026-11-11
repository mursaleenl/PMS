const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
const token='88888888-8888-8888-8888-888888888888';
const office={office_name:'Main office',timezone:'Asia/Kolkata'};
const visit={id:'visit-1',user_id:'00000000-0000-0000-0000-000000000001',work_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date()),checked_in_at:new Date().toISOString(),checked_out_at:null};
async function attendanceMocks(page,{role='employee',open=null,fail=false}={}){
 await mockWorkspace(page,{role});
 await page.route('**/rest/v1/attendance_settings?*',route=>route.fulfill({json:office}));
 await page.route('**/rest/v1/attendance_sessions?*',route=>route.fulfill({json:route.request().url().includes('checked_out_at=is.null')?open:open?[open]:[]}));
 await page.route('**/rest/v1/attendance_audit?*',route=>route.fulfill({json:[]}));
 const scans=[];
 await page.route('**/rest/v1/rpc/scan_attendance',async route=>{
  const body=route.request().postDataJSON();scans.push(body);
  if(fail)return route.fulfill({status:400,json:{message:'QR expired. Scan the current office QR and try again.'}});
  return route.fulfill({json:{...visit,checked_out_at:body.p_action==='check_out'?new Date().toISOString():null}});
 });
 return scans;
}
test('scanning automatically saves only one arrival',async({page})=>{
 const scans=await attendanceMocks(page);
 await page.setViewportSize({width:390,height:844});
 await page.goto(`/work/attendance/${token}`);
 await expect(page.getByRole('status').filter({hasText:'Checked in at'})).toBeVisible();
 expect(scans).toEqual([{p_token:token,p_action:'check_in'}]);
 await expect(page.getByRole('button',{name:'Confirm check-out',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
test('an open visit attempts checkout and expired QR failures remain visible',async({page})=>{
 const scans=await attendanceMocks(page,{open:visit,fail:true});
 await page.goto(`/work/attendance/${token}`);
 await expect(page.locator('.attendance-scan [role=alert]')).toContainText('QR expired');
 expect(scans[0].p_action).toBe('check_out');
 await expect(page.getByRole('button',{name:/Confirm check/})).toHaveCount(0);
});
test('employee history has no admin actions and office QR is admin-only',async({page})=>{
 await attendanceMocks(page,{open:visit});await page.goto('/work/attendance');
 await expect(page.getByRole('heading',{name:'Office visits',exact:true})).toBeVisible();
 await expect(page.getByRole('cell',{name:'Checked in',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Display office QR'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Correct departure'})).toHaveCount(0);
 await page.goto('/work/attendance/office');
 await expect(page.getByText('Only administrators can display the office QR.')).toBeVisible();
});
test('admin office display generates a local QR and refreshes an expired code',async({page})=>{
 await attendanceMocks(page,{role:'admin'});
 let issued=0;
 await page.route('**/rest/v1/rpc/issue_attendance_challenge',route=>{
  issued++;
  const now=new Date();
  return route.fulfill({json:{token,officeName:'Main office',timezone:office.timezone,serverTime:now.toISOString(),expiresAt:new Date(now.getTime()+60000).toISOString()}});
 });
 await page.goto('/work/attendance/office');
 await expect(page.getByRole('img',{name:'Office attendance QR code'})).toHaveAttribute('src',/^data:image\/png;base64,/);
 await page.clock.install();await page.clock.fastForward(61000);
 await expect.poll(()=>issued).toBeGreaterThan(1);
});
test('admin can correct a missing checkout with a reason',async({page})=>{
 await attendanceMocks(page,{role:'admin',open:{...visit,work_date:'2026-01-01',checked_in_at:'2026-01-01T04:00:00Z'}});
 let correction;
 await page.route('**/rest/v1/attendance_audit?*',route=>route.fulfill({json:correction?[{id:'new-correction',changed_at:new Date().toISOString(),actor_id:visit.user_id,old_record:visit,new_record:{...visit,reason:correction.p_reason,checked_out_at:correction.p_checkout}}]:[]}));
 await page.route('**/rest/v1/rpc/correct_attendance_checkout',route=>{
  correction=route.request().postDataJSON();return route.fulfill({json:null});
 });
 await page.goto('/work/attendance');
 await page.getByRole('button',{name:'Correct departure'}).click();
 await page.getByLabel('Departure (device local time)').fill('2026-01-01T17:30');
 await page.getByLabel('Reason',{exact:true}).fill('Forgot to scan at departure');
 await page.getByRole('button',{name:'Save correction',exact:true}).click();
 await expect.poll(()=>correction?.p_reason).toBe('Forgot to scan at departure');
 expect(correction.p_session).toBe('visit-1');
 await expect(page.locator('#attendance-change-history .attendance-record-count')).toHaveText('1 change');
});
test('signed-out QR links preserve their token on the sign-in redirect',async({page})=>{
 await page.goto(`/work/attendance/${token}`);
 await expect(page).toHaveURL(new RegExp(`/sign-in\\?from=${encodeURIComponent(`/work/attendance/${token}`)}`));
});
test('a reused arrival code cannot report a completed visit as a new check-in',async({page})=>{
 await attendanceMocks(page);
 await page.route('**/rest/v1/rpc/scan_attendance',route=>route.fulfill({json:{...visit,checked_out_at:new Date().toISOString()}}));
 await page.goto(`/work/attendance/${token}`);
 await expect(page.locator('.attendance-scan [role=alert]')).toContainText('already recorded a completed visit');
 await expect(page.getByRole('status').filter({hasText:'Checked in at'})).toHaveCount(0);
});
test('a previous-day open visit requires admin correction before another scan',async({page})=>{
 const scans=await attendanceMocks(page,{open:{...visit,work_date:'2000-01-01'}});
 await page.goto(`/work/attendance/${token}`);
 await expect(page.locator('.attendance-scan [role=alert]')).toContainText('Missing checkout');
 await expect(page.getByRole('button',{name:/Confirm check/})).toHaveCount(0);
 expect(scans).toHaveLength(0);
});

test('performance shows completed duration without inventing hours for an open visit',async({page})=>{
 await attendanceMocks(page,{role:'admin'});
 const arrival='2026-10-29T04:00:00Z',departure='2026-10-29T04:15:00Z';
 await page.route('**/rest/v1/attendance_sessions?*',route=>route.fulfill({json:route.request().url().includes('checked_out_at=is.null')?null:[{...visit,id:'closed',work_date:'2026-10-29',checked_in_at:arrival,checked_out_at:departure},{...visit,id:'open',work_date:'2026-10-29',checked_in_at:'2026-10-29T05:00:00Z'}]}));
 await page.route('**/rest/v1/attendance_records?*',route=>route.fulfill({json:[{id:'daily',user_id:visit.user_id,work_date:'2026-10-29',status:'PRESENT',hours_logged:0.25,notes:null}]}));
 await page.goto('/work/attendance');
 await page.getByLabel('From',{exact:true}).fill('2026-10-01');
 await page.getByLabel('To',{exact:true}).fill(new Date().toISOString().slice(0,10));
 const table=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'Hours',exact:true})});
 await expect(table.getByRole('cell',{name:'0.25',exact:true})).toHaveCount(1);
 await expect(table.getByRole('cell',{name:'—',exact:true})).toHaveCount(2); // No departure or notes for the open visit.
 await expect(table.getByRole('columnheader',{name:'Arrival',exact:true})).toBeVisible();
});

for(const action of ['check_in','check_out'])test(`mobile camera records the selected ${action} action`,async({page})=>{
 const QRCode=require('qrcode');
 const qr=await QRCode.toDataURL(`${new URL(process.env.PMS_TEST_URL||"http://localhost:3000").origin}/work/attendance/${token}`,{width:480,margin:4});
 const scans=await attendanceMocks(page,{open:action==='check_out'?visit:null});
 await page.addInitScript(({qr})=>{
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
   const canvas=document.createElement('canvas');canvas.width=480;canvas.height=480;
   const image=new Image();image.src=qr;await image.decode();
   const paint=()=>canvas.getContext('2d').drawImage(image,0,0);paint();
   const timer=setInterval(paint,60),stream=canvas.captureStream(15);
   for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);window.attendanceCameraStopped=true;stop();};}
   return stream;
  }});
 },{qr});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/work/attendance');
 await expect(page.getByRole('region',{name:'My attendance profile'})).toContainText('Alex Morgan');
 await page.getByRole('button',{name:'Scan attendance',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Scan attendance',exact:true});
 await expect(dialog.getByRole('button',{name:'Check In',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Check Out',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.attendanceCameraStopped)).toBeUndefined();
 expect(scans).toHaveLength(0);
 await dialog.getByRole('button',{name:action==='check_in'?'Check In':'Check Out',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/work/attendance/${token}\\?action=${action}$`),{timeout:15000});
 expect(await page.evaluate(()=>window.attendanceCameraStopped)).toBe(true);
 await expect(page.getByRole('status').filter({hasText:action==='check_in'?'Checked in at':'Checked out at'})).toBeVisible();
 expect(scans).toEqual([{p_token:token,p_action:action}]);
});
test('camera denial shows the error without a fallback attendance form',async({page})=>{
 const scans=await attendanceMocks(page);
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
 await page.goto('/work/attendance');await page.getByRole('button',{name:'Scan attendance',exact:true}).click();
 await page.getByRole('button',{name:'Check In',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Scan QR to check in'});
 await expect(dialog.getByRole('alert')).toContainText('Camera permission was denied');
 await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();
 expect(scans).toHaveLength(0);
});

test('personal attendance totals stay attached to the authenticated user',async({page})=>{
 await attendanceMocks(page,{role:'admin'});
 await page.route('**/rest/v1/attendance_sessions?*',route=>route.fulfill({json:route.request().url().includes('checked_out_at=is.null')?null:[{...visit,checked_in_at:'2026-10-29T04:00:00Z',checked_out_at:'2026-10-29T04:15:00Z'},{...visit,id:'other-visit',user_id:'00000000-0000-0000-0000-000000000002',checked_in_at:'2026-10-29T04:00:00Z',checked_out_at:'2026-10-29T12:00:00Z'}]}));
 await page.goto('/work/attendance');
 const profile=page.getByRole('region',{name:'My attendance profile'});
 await expect(profile).toContainText('Alex Morgan');
 await expect(profile.locator('strong').filter({hasText:/^0\.25$/})).toBeVisible();
 await expect(profile).not.toContainText('8.25');
});

test('attendance changes expand into a list, expand all, and load older entries without duplicates',async({page})=>{
 await attendanceMocks(page,{role:'admin'});
 const rows=Array.from({length:55},(_,index)=>({
  id:`change-${String(55-index).padStart(3,'0')}`,
  changed_at:new Date(Date.now()-index*60000).toISOString(),actor_id:visit.user_id,
  old_record:{user_id:visit.user_id,work_date:visit.work_date,hours_logged:6},
  new_record:{user_id:visit.user_id,work_date:visit.work_date,hours_logged:8,status:'PRESENT',reason:`Correction ${index+1}`},
 }));
 let olderAttempts=0;
 await page.route('**/rest/v1/attendance_audit?*',route=>{
  const query=new URL(route.request().url()).searchParams;
  if(query.has('or')){
   expect(query.get('or')).toContain(rows[49].changed_at);
   expect(query.get('or')).toContain(rows[49].id);
   olderAttempts++;
   if(olderAttempts===1)return route.fulfill({status:400,json:{message:'Temporary history failure'}});
   return route.fulfill({json:rows.slice(50)});
  }
  return route.fulfill({json:rows.slice(0,51)});
 });
 await page.goto('/work/attendance');
 const history=page.locator('#attendance-change-history');
 await expect(history.locator('.attendance-record-count')).toHaveText('50+ changes');
 await expect(history).not.toHaveAttribute('open');
 await expect(history.getByRole('button',{name:'Expand all',exact:true})).not.toBeVisible();
 await history.locator('summary').click();
 await expect(history.locator('.attendance-change-list > li')).toHaveCount(50);
 await expect(history.locator('.attendance-change-copy strong').first()).toHaveText('Correction 1');
 await expect(history.locator('.attendance-change-copy strong').last()).toHaveText('Correction 50');
 expect(await history.evaluate(el=>Boolean(el.querySelector('.attendance-change-list').compareDocumentPosition(el.querySelector('.attendance-changes-tools'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await history.getByRole('button',{name:'Expand all',exact:true}).click();
 await expect(history.locator('.attendance-change-details')).toHaveCount(50);
 await history.getByRole('button',{name:'Collapse all',exact:true}).click();
 await expect(history.locator('.attendance-change-details')).toHaveCount(0);
 await history.locator('.attendance-change-toggle').first().click();
 await expect(history.locator('.attendance-change-details')).toContainText('Updated daily hours8');
 await history.getByRole('button',{name:'Load older changes',exact:true}).click();
 await expect(history.getByRole('alert')).toContainText('Unable to load older changes');
 await expect(history.locator('.attendance-change-list > li')).toHaveCount(50);
 await history.getByRole('button',{name:'Load older changes',exact:true}).click();
 await expect(history.locator('.attendance-change-list > li')).toHaveCount(55);
 await expect(history.locator('.attendance-record-count')).toHaveText('55 changes');
 await expect(history.getByRole('button',{name:'Load older changes',exact:true})).toHaveCount(0);
 expect(olderAttempts).toBe(2);
 await page.setViewportSize({width:320,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await history.locator('summary').click();
 await expect(history.locator('.attendance-change-list')).not.toBeVisible();
});

test('employees cannot see or request the attendance change list',async({page})=>{
 await attendanceMocks(page);let auditRequests=0;
 await page.route('**/rest/v1/attendance_audit?*',route=>{auditRequests++;return route.fulfill({json:[]});});
 await page.goto('/work/attendance');
 await expect(page.getByRole('heading',{name:'Office visits',exact:true})).toBeVisible();
 await expect(page.locator('#attendance-change-history')).toHaveCount(0);
 expect(auditRequests).toBe(0);
});

test('personal attendance calendar marks own days once and opens daily visits across months',async({page})=>{
 await page.clock.install({time:new Date('2026-11-04T10:00:00Z')});
 await attendanceMocks(page,{role:'admin'});
 const own=visit.user_id,other='00000000-0000-0000-0000-000000000002';
 const november=[
  {id:'first',user_id:own,work_date:'2026-11-02',checked_in_at:'2026-11-02T08:00:00Z',checked_out_at:'2026-11-02T10:00:00Z'},
  {id:'second',user_id:own,work_date:'2026-11-02',checked_in_at:'2026-11-02T12:00:00Z',checked_out_at:'2026-11-02T13:00:00Z'},
  {id:'missing',user_id:own,work_date:'2026-11-01',checked_in_at:'2026-11-01T08:00:00Z',checked_out_at:null},
  {id:'other-person',user_id:other,work_date:'2026-11-03',checked_in_at:'2026-11-03T08:00:00Z',checked_out_at:null},
 ];
 const october=[{...november[0],id:'october',work_date:'2026-10-31',checked_in_at:'2026-10-31T08:00:00Z',checked_out_at:'2026-10-31T10:00:00Z'}];
 const queries=[];
 await page.route('**/rest/v1/attendance_sessions?*',route=>{
  const query=new URL(route.request().url()).searchParams;
  if(query.has('checked_out_at'))return route.fulfill({json:null});
  if(query.has('user_id')){
   expect(query.get('user_id')).toBe(`eq.${own}`);queries.push(route.request().url());
   return route.fulfill({json:query.getAll('work_date').includes('gte.2026-10-01')?october:november});
  }
  return route.fulfill({json:[]});
 });
 await page.goto('/work/attendance');
 const calendar=page.getByRole('region',{name:'My attendance calendar',exact:true});
 await expect(calendar.locator('.attendance-calendar-count')).toHaveText('2 days attended');
 await expect(calendar.locator('.attendance-calendar-day .attendance-date-dot')).toHaveCount(2);
 await expect(calendar.locator('[data-date="2026-11-03"] .attendance-date-dot')).toHaveCount(0);
 await expect(calendar.getByRole('button',{name:'Next attendance month'})).toBeDisabled();
 await calendar.locator('[data-date="2026-11-02"]').click();
 await expect(calendar.locator('.attendance-calendar-day-details li')).toHaveCount(2);
 await expect(calendar.locator('[data-date="2026-11-02"]')).toHaveCSS('background-color','rgb(15, 23, 42)');
 await expect(calendar.locator('[data-date="2026-11-02"] > span').first()).toHaveCSS('color','rgb(255, 255, 255)');
 await calendar.locator('[data-date="2026-11-01"]').click();
 await expect(calendar.locator('.attendance-calendar-day-details')).toContainText('Missing checkout');
 await calendar.locator('[data-date="2026-11-03"]').click();
 await expect(calendar.locator('.attendance-calendar-day-details')).toHaveText(/No attendance recorded for this date/);
 await calendar.getByRole('button',{name:'Previous attendance month'}).click();
 await expect(calendar.getByRole('heading',{name:'October 2026',exact:true})).toBeVisible();
 await expect(calendar.locator('.attendance-calendar-count')).toHaveText('1 day attended');
 await expect(calendar.locator('[data-date="2026-10-31"] .attendance-date-dot')).toHaveCount(1);
 await expect(calendar.locator('[data-date="2026-11-02"]')).toHaveCount(0);
 expect(queries.some(url=>decodeURIComponent(url).includes('lte.2026-10-31'))).toBe(true);
 await calendar.getByRole('button',{name:'Today',exact:true}).click();
 await expect(calendar.getByRole('heading',{name:'November 2026',exact:true})).toBeVisible();
 await expect(calendar.locator('[data-date="2026-11-04"]')).toHaveAttribute('aria-pressed','true');
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:1000});
  expect(await calendar.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  if(width===390)await calendar.screenshot({path:'/private/tmp/pms-attendance-calendar.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 }
});

test('attendance calendar handles leap months and retries failed loading',async({page})=>{
 await page.clock.install({time:new Date('2024-03-15T10:00:00Z')});
 await attendanceMocks(page);let failCalendar=true;
 await page.route('**/rest/v1/attendance_sessions?*',route=>{
  const query=new URL(route.request().url()).searchParams;
  if(query.has('checked_out_at'))return route.fulfill({json:null});
  if(query.has('user_id')&&failCalendar)return route.fulfill({status:400,json:{message:'Calendar unavailable'}});
  return route.fulfill({json:[]});
 });
 await page.goto('/work/attendance');
 const calendar=page.getByRole('region',{name:'My attendance calendar',exact:true});
 await expect(calendar.getByRole('alert')).toContainText('Unable to load visits');
 failCalendar=false;
 await calendar.getByRole('button',{name:'Retry calendar'}).click();
 await expect(calendar.locator('.attendance-calendar-count')).toHaveText('0 days attended');
 await calendar.getByRole('button',{name:'Previous attendance month'}).click();
 await expect(calendar.getByRole('heading',{name:'February 2024',exact:true})).toBeVisible();
 await expect(calendar.locator('.attendance-calendar-day')).toHaveCount(29);
 await expect(calendar.locator('[data-date="2024-02-29"]')).toBeEnabled();
 await expect(calendar.locator('.attendance-calendar-days > span')).toHaveCount(3);
});

test('office visits default to the signed-in account and allow explicit team filters',async({page})=>{
 await attendanceMocks(page,{role:'admin'});
 const otherId='00000000-0000-0000-0000-000000000002';
 const rows=[{...visit,id:'own-visit',checked_out_at:visit.checked_in_at},{...visit,id:'other-visit',user_id:otherId,checked_out_at:visit.checked_in_at}];
 await page.route('**/rest/v1/attendance_sessions?*',route=>route.fulfill({json:route.request().url().includes('checked_out_at=is.null')?null:rows}));
 await page.goto('/work/attendance');
 const select=page.getByRole('combobox',{name:'Team member',exact:true});
 const table=page.locator('.attendance-visits-panel tbody');
 await expect(select).toHaveValue(visit.user_id);
 await expect(table.locator('tr')).toHaveCount(1);
 await expect(table).toContainText('Alex Morgan');
 await expect(table).not.toContainText('Jordan Lee');
 await select.selectOption(otherId);
 await expect(table.locator('tr')).toHaveCount(1);
 await expect(table).toContainText('Jordan Lee');
 await select.selectOption('');
 await expect(table.locator('tr')).toHaveCount(2);
 await page.getByRole('button',{name:'Refresh history',exact:true}).click();
 await expect(select).toHaveValue('');
 await expect(table.locator('tr')).toHaveCount(2);
 await page.reload();
 await expect(select).toHaveValue(visit.user_id);
 await expect(table.locator('tr')).toHaveCount(1);
});

for(const action of ['check_in','check_out'])test(`an invalid ${action} choice never records the opposite action`,async({page})=>{
 const scans=await attendanceMocks(page,{open:action==='check_in'?visit:null});
 await page.goto(`/work/attendance/${token}?action=${action}`);
 await expect(page.locator('.attendance-scan [role=alert]')).toContainText(action==='check_in'?'already checked in':'not checked in');
 expect(scans).toHaveLength(0);
});
