const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {readDatabaseSections}=require('./database-sql.cjs');
const {TARGETS,baselineFiles}=require('./database-targets.cjs');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function timestamp(date){return date.toISOString().replace(/\D/g,'').slice(0,14);}
function nextVersion(files,now){const latest=files.map(file=>file.match(/^(\d{14})_.*\.sql$/)?.[1]).filter(Boolean).sort().at(-1);let date=new Date(now);if(latest&&timestamp(date)<=latest)date=new Date(Date.UTC(+latest.slice(0,4),+latest.slice(4,6)-1,+latest.slice(6,8),+latest.slice(8,10),+latest.slice(10,12),+latest.slice(12,14))+1000);return timestamp(date);}
function prepareMigration({root=path.resolve(__dirname,'..'),sections=readDatabaseSections(),name,fresh=false,check=false,now=new Date()}={}){
 const directory=path.join(root,'supabase/migrations'),stateFile=path.join(root,'supabase/migration-state.json');
 const files=fs.existsSync(directory)?fs.readdirSync(directory):[];
 const targetBaselines=TARGETS.flatMap(target=>baselineFiles(root,target));
 const previous=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
 if(previous&&previous.version!==1)throw new Error('Unsupported migration-state version.');
 for(const migration of previous?.migrations??[]){const file=path.join(directory,migration.file);if(!fs.existsSync(file)||hash(fs.readFileSync(file,'utf8'))!==migration.sha256)throw new Error(`Previously generated migration changed or is missing: ${migration.file}. Restore it and create a new migration.`);}
 const fingerprints=Object.fromEntries(sections.map(section=>[section.name,hash(section.body)]));
 const removed=Object.keys(previous?.sections??{}).filter(name=>!Object.hasOwn(fingerprints,name));
 if(removed.length)throw new Error(`Canonical sections were removed or renamed: ${removed.join(', ')}. Keep existing sections and add an explicit SQL update instead.`);
 const previousOrder=Object.keys(previous?.sections??{});
 const currentOrder=sections.filter(section=>Object.hasOwn(previous?.sections??{},section.name)).map(section=>section.name);
 if(JSON.stringify(previousOrder)!==JSON.stringify(currentOrder))throw new Error('Existing canonical sections were reordered. Preserve their dependency order and add an explicit SQL update.');
 const changed=sections.filter(section=>previous?.sections[section.name]!==fingerprints[section.name]);
 if(check)return {initialized:Boolean(previous),changed:changed.map(section=>section.name),file:null};
 if(!name||!/^[a-z][a-z0-9_]{0,70}$/.test(name))throw new Error('Choose a migration name using lowercase letters, numbers and underscores, e.g. add_report_status.');
 if(!previous&&!fresh&&TARGETS.some(target=>!baselineFiles(root,target).length))throw new Error('Pull the main database baseline first: npm run db:pull. For a fresh empty local database, add --fresh.');
 if(previous&&fresh)throw new Error('A migration baseline already exists. Create an incremental migration without --fresh.');
 if(!changed.length)return {initialized:true,changed:[],file:null};
 // Later sections override earlier functions and policies. Replay the suffix to preserve those overrides.
 const businessChanges=changed.filter(section=>section.name!=='migration-locks');
 const first=businessChanges.length?sections.findIndex(section=>businessChanges.some(item=>item.name===section.name)):sections.length;
 const guard=sections.find(section=>section.name==='migration-locks');
 const included=sections.slice(first);if(guard&&!included.some(section=>section.name===guard.name))included.unshift(guard);
 const sql='-- Generated from supabase/main-database.sql. Review and commit this file.\n-- Immutable migration: make later changes in a new migration.\n'+included.map(section=>`\n-- ===== Section: ${section.name} =====\n${section.body}\n`).join('');
 const filename=`${nextVersion([...files,...targetBaselines],now)}_${name}.sql`;
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,filename),sql,{flag:'wx'});
 const state={version:1,sections:fingerprints,migrations:[...(previous?.migrations??[]),{file:filename,sha256:hash(sql)}]};
 fs.writeFileSync(`${stateFile}.tmp`,JSON.stringify(state,null,2)+'\n');fs.renameSync(`${stateFile}.tmp`,stateFile);
 return {initialized:true,changed:changed.map(section=>section.name),included:included.map(section=>section.name),file:path.join(directory,filename)};
}
if(require.main===module){try{const args=process.argv.slice(2);const result=prepareMigration({name:args.find(arg=>!arg.startsWith('--')),fresh:args.includes('--fresh'),check:args.includes('--check')});if(result.file)console.log(`Created ${path.relative(process.cwd(),result.file)}\nChanged sections: ${result.changed.join(', ')}\nReview the SQL, then run npm run db:preview.`);else if(!result.initialized)console.log('CLI configured; migration baseline not initialized. Follow DATABASE_WORKFLOW.md to pull the main database baseline first.');else if(result.changed.length){console.error(`Unprepared SQL sections: ${result.changed.join(', ')}`);process.exitCode=1;}else console.log('Canonical SQL matches the prepared migrations.');}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={prepareMigration};
