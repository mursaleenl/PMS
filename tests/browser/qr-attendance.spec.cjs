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

test('mobile camera decodes the office QR and records attendance automatically',async({page})=>{
 const QRCode=require('qrcode');
 const qr=await QRCode.toDataURL(`${new URL(process.env.PMS_TEST_URL||"http://localhost:3000").origin}/work/attendance/${token}`,{width:480,margin:4});
 const scans=await attendanceMocks(page);
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
 await expect(page).toHaveURL(new RegExp(`/work/attendance/${token}$`),{timeout:15000});
 expect(await page.evaluate(()=>window.attendanceCameraStopped)).toBe(true);
 await expect(page.getByRole('status').filter({hasText:'Checked in at'})).toBeVisible();
 expect(scans).toHaveLength(1);
});
test('camera denial shows the error without a fallback attendance form',async({page})=>{
 const scans=await attendanceMocks(page);
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
 await page.goto('/work/attendance');await page.getByRole('button',{name:'Scan attendance',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Scan attendance QR'});
 await expect(dialog.getByRole('alert')).toContainText('Camera permission was denied');
 await expect(dialog.locator('input, button')).toHaveCount(0);
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
