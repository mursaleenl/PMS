const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {findContainerRuntime,requireContainerRuntime}=require('../scripts/container-runtime.cjs');
test('Docker Desktop is discovered when an existing terminal PATH does not include it',()=>{
 const binary=path.join('/test-user','.docker/bin/docker');const runtime=findContainerRuntime({environment:{PATH:'/usr/bin',KEEP:'value'},home:'/test-user',platform:'darwin',exists:file=>file===binary});assert.equal(runtime.binary,binary);assert.equal(runtime.environment.PATH,'/test-user/.docker/bin:/usr/bin');assert.equal(runtime.environment.KEEP,'value');
});
test('pull preflight fails with actionable missing-runtime or stopped-engine messages',()=>{
 assert.throws(()=>requireContainerRuntime({environment:{PATH:''},home:'/test-user',exists:()=>false}),/temporary shadow database/);
 assert.throws(()=>requireContainerRuntime({environment:{PATH:'/test-bin'},exists:file=>file==='/test-bin/docker',run:()=>({status:1})}),/Open Docker Desktop/);
});
test('ready engine is verified using the resolved binary and its PATH is forwarded',()=>{
 let called=false;const result=requireContainerRuntime({environment:{PATH:'/usr/bin'},home:'/test-user',exists:file=>file==='/test-user/.docker/bin/docker',run:(binary,args,options)=>{called=true;assert.equal(binary,'/test-user/.docker/bin/docker');assert.deepEqual(args,['info']);assert.equal(options.env.PATH,'/test-user/.docker/bin:/usr/bin');return {status:0};}});assert.equal(called,true);assert.equal(result.PATH,'/test-user/.docker/bin:/usr/bin');
});
