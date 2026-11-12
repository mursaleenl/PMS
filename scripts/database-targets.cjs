const {requireContainerRuntime}=require('./container-runtime.cjs');
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const TARGETS=['main'];const isMigration=file=>/^\d{14}_.+\.sql$/.test(file);
function targetPaths(root,target){if(!TARGETS.includes(target))throw new Error('Only the main database is configured. Use --target main.');const workdir=path.join(root,'supabase/environments',target);return {workdir,config:path.join(workdir,'supabase/config.toml'),migrations:path.join(workdir,'supabase/migrations')};}
function baselineFiles(root,target){const directory=targetPaths(root,target).migrations;return fs.existsSync(directory)?fs.readdirSync(directory).filter(file=>isMigration(file)&&file.includes(`_${target}_baseline`)):[];}
function readTargets(root,environment=process.env){
 const file=path.join(root,'supabase/targets.local.json');const local=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};const targets={};
 for(const target of TARGETS){const projectRef=environment[`SUPABASE_${target.toUpperCase()}_PROJECT_REF`]||local[target]?.projectRef||'';if(projectRef&&!/^[a-z]{20}$/.test(projectRef))throw new Error(`Invalid ${target} project reference. Use the 20-letter reference from the Supabase dashboard.`);targets[target]={projectRef};}
 return targets;
}
function configureTarget(root,target,reference){
 if(/^https?:\/\//.test(reference||'')){try{reference=new URL(reference).hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1]||'';}catch{reference='';}}
 targetPaths(root,target);if(!/^[a-z]{20}$/.test(reference||''))throw new Error('Use the 20-letter project reference from the Supabase dashboard.');
 const file=path.join(root,'supabase/targets.local.json'),local=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 local[target]={projectRef:reference};const configured={main:local.main};fs.writeFileSync(file,JSON.stringify(configured,null,2)+'\n',{mode:0o600});
}
function ensureContext(root,target){
 const paths=targetPaths(root,target);fs.mkdirSync(paths.migrations,{recursive:true});
 if(!fs.existsSync(paths.config)){const source=fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8'),major=source.match(/^major_version\s*=\s*(\d+)/m)?.[1]||'17';fs.writeFileSync(paths.config,`# Remote migration context; use the root config for the local stack.\nproject_id = "PMS_${target}"\n[db]\nmajor_version = ${major}\n[db.migrations]\nenabled = true\nschema_paths = []\n[db.seed]\nenabled = false\nsql_paths = []\n`);}
 return paths;
}
function syncMigrations(root,target){
 const paths=ensureContext(root,target),source=path.join(root,'supabase/migrations'),baselines=baselineFiles(root,target);
 if(!baselines.length)throw new Error(`Pull the ${target} baseline first: npm run db:pull:${target}`);
 const stateFile=path.join(root,'supabase/migration-state.json');
 if(!fs.existsSync(stateFile))throw new Error('Prepare a shared migration first: npm run db:prepare -- descriptive_name');
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));const names=(state.migrations??[]).map(item=>item.file);
 if(names.some(name=>!isMigration(name)||name.includes('/')||name.includes('\\')))throw new Error('Invalid shared migration filename.');
 for(const name of names){const body=fs.readFileSync(path.join(source,name),'utf8'),destination=path.join(paths.migrations,name);if(fs.existsSync(destination)){if(fs.readFileSync(destination,'utf8')!==body)throw new Error(`Migration differs in ${target}: ${name}. Restore the original migration before continuing.`);}else fs.writeFileSync(destination,body,{flag:'wx'});}
 return paths;
}
function planCommand({root,target,action,extra=[],environment=process.env}){
 const paths=targetPaths(root,target),targets=readTargets(root,environment),projectRef=targets[target].projectRef;
 if(!projectRef)throw new Error(`Configure ${target} first: npm run db:target -- ${target} YOUR_PROJECT_REF`);
 if(extra.some(arg=>/^(--remote|--linked|--db-url|--project-ref|--workdir)(=|$)/.test(arg)))throw new Error('Target overrides are not accepted here. Use the configured main database command.');
 const remote=`--remote=${projectRef}`,commands={preview:['db','push',remote,'--dry-run','--skip-vault'],push:['db','push',remote,'--skip-vault'],pull:['db','pull',remote,'--schema','public',`${target}_baseline`],history:['migration','list',remote],link:['link','--project-ref',projectRef]};
 if(!commands[action])throw new Error('Choose preview, push, pull, history or link.');
 return {...paths,projectRef,args:[...commands[action],'--workdir',paths.workdir,...extra]};
}
function main(){
 const root=path.resolve(__dirname,'..'),[action,...raw]=process.argv.slice(2);
 if(action==='configure'){const [target,reference]=raw;configureTarget(root,target,reference);console.log(`Configured ${target}. Application connection settings were not changed.`);return;}
 if(action==='list'){const targets=readTargets(root);for(const name of TARGETS)console.log(`${name}: ${targets[name].projectRef||'not configured'}; baseline: ${baselineFiles(root,name).length?'present':'not pulled'}`);return;}
 const args=[...raw];const index=args.indexOf('--target');const target=index<0?'main':args[index+1];if(index>=0)args.splice(index,2);
 const plan=planCommand({root,target,action,extra:args});ensureContext(root,target);
 if(['preview','push'].includes(action)){
  const {prepareMigration}=require('./create-database-migration.cjs');const state=prepareMigration({check:true});if(!state.initialized||state.changed.length)throw new Error('Prepare the shared SQL changes first: npm run db:prepare -- descriptive_name');
  syncMigrations(root,target);
 }else if(baselineFiles(root,target).length&&fs.existsSync(path.join(root,'supabase/migration-state.json')))syncMigrations(root,target);
 const environment=action==='pull'?requireContainerRuntime():process.env;
 console.log(`Database target: ${target.toUpperCase()} (${plan.projectRef})`);
 const result=spawnSync(process.execPath,[path.join(root,'scripts/supabase.cjs'),...plan.args],{cwd:root,stdio:'inherit',env:environment});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}
module.exports={TARGETS,targetPaths,baselineFiles,readTargets,configureTarget,ensureContext,syncMigrations,planCommand};
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
