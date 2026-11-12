// Use the project's pinned CLI and keep usage telemetry disabled for these commands.
const {spawnSync}=require('node:child_process');const path=require('node:path');
const cli=path.join(path.dirname(require.resolve('supabase/package.json')),'dist/supabase.js');
const result=spawnSync(process.execPath,[cli,...process.argv.slice(2)],{cwd:path.resolve(__dirname,'..'),stdio:'inherit',env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'}});
if(result.error){console.error(result.error.message);process.exitCode=1;}else process.exitCode=result.status??1;
