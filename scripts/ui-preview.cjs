const {chromium}=require('@playwright/test');
const {mockWorkspace}=require('../tests/browser/fixtures.cjs');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await mockWorkspace(page);
 for(const [route,label] of [['/','dashboard'],['/invoices','invoices'],['/work','tasks'],['/requests','leads'],['/projects','projects'],['/clients','clients']]){
  await page.goto('http://localhost:3000'+route);await page.getByRole('heading',{level:1}).first().waitFor();
  await page.screenshot({path:`/private/tmp/pms-${label}.png`,fullPage:true});
  console.log(label,await page.getByRole('heading',{level:1}).first().innerText());
 }
 console.log({errors});await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
