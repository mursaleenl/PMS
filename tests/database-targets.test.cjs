const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {configureTarget,readTargets,ensureContext,planCommand,syncMigrations}=require('../scripts/database-targets.cjs');
const main='bcdefghijklmnopqrstu';
function root(){const value=fs.mkdtempSync(path.join(os.tmpdir(),'pms-main-target-'));fs.mkdirSync(path.join(value,'supabase'));fs.writeFileSync(path.join(value,'supabase/config.toml'),'project_id="PMS"\n[db]\nmajor_version=17\n');return value;}
test('only main is configured; testing and command-level target overrides are rejected',()=>{
 const dir=root();try{
  configureTarget(dir,'main',`https://${main}.supabase.co`);const targets=readTargets(dir,{});assert.deepEqual(Object.keys(targets),['main']);assert.equal(targets.main.projectRef,main);
  const plan=planCommand({root:dir,target:'main',action:'preview',environment:{}});assert.ok(plan.args.includes(`--remote=${main}`));assert.ok(plan.args.includes('--dry-run'));
  assert.throws(()=>configureTarget(dir,'testing','abcdefghijklmnopqrst'),/Only the main/);assert.throws(()=>planCommand({root:dir,target:'testing',action:'push',environment:{}}),/Only the main/);assert.throws(()=>planCommand({root:dir,target:'main',action:'push',extra:['--remote=abcdefghijklmnopqrst'],environment:{}}),/overrides/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('main receives only prepared migrations and never an unrelated manual baseline',()=>{
 const dir=root();try{
  configureTarget(dir,'main',main);const context=ensureContext(dir,'main');assert.throws(()=>syncMigrations(dir,'main'),/baseline first/);
  fs.writeFileSync(path.join(context.migrations,'20261102000000_main_baseline.sql'),'-- main schema');fs.mkdirSync(path.join(dir,'supabase/migrations'));fs.writeFileSync(path.join(dir,'supabase/migrations/20261103000000_shared.sql'),'select 1;');fs.writeFileSync(path.join(dir,'supabase/migrations/20261105_legacy.sql'),'-- legacy manual script');fs.writeFileSync(path.join(dir,'supabase/migrations/20261104000000_foreign_baseline.sql'),'-- unrelated manual baseline');fs.writeFileSync(path.join(dir,'supabase/migration-state.json'),JSON.stringify({version:1,migrations:[{file:'20261103000000_shared.sql'}]}));
  syncMigrations(dir,'main');assert.equal(fs.readFileSync(path.join(context.migrations,'20261103000000_shared.sql'),'utf8'),'select 1;');assert.equal(fs.existsSync(path.join(context.migrations,'20261105_legacy.sql')),false);assert.equal(fs.existsSync(path.join(context.migrations,'20261104000000_foreign_baseline.sql')),false);
  fs.writeFileSync(path.join(context.migrations,'20261103000000_shared.sql'),'select 2;');assert.throws(()=>syncMigrations(dir,'main'),/differs in main/);assert.equal(fs.readFileSync(path.join(context.migrations,'20261103000000_shared.sql'),'utf8'),'select 2;');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
