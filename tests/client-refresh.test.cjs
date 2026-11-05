const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');

// Exercise the hooks with controlled requests, including the intermediate render
// that used to remove documents from the page on every focus event.
function harness(file,exportName){
 let cursor=0,slots=[],effects=[],session={access_token:'token',user:{id:'client-a'}};
 const react={
  useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
  useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
  useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){old?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}}
 };
 const hook=createLoader({react,'@/lib/workspace-auth':{useWorkspaceAuth:()=>({session})}})(file)[exportName];
 return {render(){cursor=0;const result=hook();const pending=effects;effects=[];pending.forEach(fn=>fn());return result;},setSession(value){session=value;},cleanup(){slots.forEach(slot=>slot?.cleanup?.());}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('focus refresh keeps invoice and proposal records mounted; account changes clear old records',async()=>{
 const originals={window:global.window,document:global.document,fetch:global.fetch};
 global.window=Object.assign(new EventTarget(),{setInterval,clearInterval});global.document=Object.assign(new EventTarget(),{hidden:false});
 const requests=[];
 global.fetch=(_url,options)=>new Promise(resolve=>requests.push({resolve,options}));
 const h=harness('lib/client-records.ts','useClientRecords');
 const data={proposals:[{id:'proposal-a'}],invoices:[{id:'invoice-a'}],documents:[]};
 try{
  h.render();assert.equal(h.render().loading,true);
  requests[0].resolve({ok:true,json:async()=>data});await settle();
  assert.equal(h.render().invoices[0].id,'invoice-a');
  window.dispatchEvent(new Event('focus'));h.render();
  const refreshing=h.render();
  assert.equal(refreshing.loading,false);
  assert.deepEqual(refreshing.proposals,data.proposals);
  assert.deepEqual(refreshing.invoices,data.invoices);
  // Repeated focus from a PDF iframe does not trigger a request loop.
  window.dispatchEvent(new Event('focus'));h.render();assert.equal(requests.length,2);
  requests[1].resolve({ok:true,json:async()=>data});await settle();
  h.setSession({access_token:'new-token',user:{id:'client-b'}});h.render();
  const switched=h.render();assert.equal(switched.loading,true);assert.deepEqual(switched.invoices,[]);
 }finally{h.cleanup();Object.assign(global,originals);}
});
test('project pages retain content during token refresh and reset on sign out',async()=>{
 const originals={fetch:global.fetch,window:global.window,document:global.document};const requests=[];
 global.window=Object.assign(new EventTarget(),{setInterval,clearInterval});global.document=Object.assign(new EventTarget(),{hidden:false});
 global.fetch=()=>new Promise(resolve=>requests.push(resolve));
 const h=harness('lib/client-workspace.ts','useClientWorkspace');
 try{
  h.render();requests[0]({ok:true,json:async()=>({projects:[{id:'p1'}]})});await settle();
  h.setSession({access_token:'refreshed',user:{id:'client-a'}});h.render();
  assert.equal(h.render().loading,false);assert.equal(h.render().projects[0].id,'p1');
  h.setSession(null);h.render();assert.deepEqual(h.render().projects,[]);assert.equal(h.render().loading,false);
 }finally{h.cleanup();Object.assign(global,originals);}
});
