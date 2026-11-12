const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawnSync}=require('node:child_process');
function findContainerRuntime({environment=process.env,home=os.homedir(),platform=process.platform,exists=file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}}}={}){
 const delimiter=platform==='win32'?';':path.delimiter,extension=platform==='win32'?'.exe':'';
 const directories=[...(environment.PATH||'').split(delimiter).filter(Boolean),path.join(home,'.docker/bin'),'/Applications/Docker.app/Contents/Resources/bin',path.join(home,'.orbstack/bin'),'/opt/homebrew/bin','/usr/local/bin'];
 for(const executable of ['docker','podman'])for(const directory of [...new Set(directories)]){const binary=path.join(directory,executable+extension);if(exists(binary))return {binary,environment:{...environment,PATH:[directory,environment.PATH||''].filter(Boolean).join(delimiter)}};}
 return null;
}
function requireContainerRuntime({environment=process.env,run=spawnSync,...options}={}){
 const runtime=findContainerRuntime({environment,...options});
 if(!runtime)throw new Error('Supabase db:pull needs Docker Desktop or Podman to create a temporary shadow database. Install and start a container runtime, then retry npm run db:pull.');
 const result=run(runtime.binary,['info'],{env:runtime.environment,encoding:'utf8',timeout:10000});
 if(result.status!==0)throw new Error('The container CLI is installed, but its engine is not ready. Open Docker Desktop, wait until the engine is running, then retry npm run db:pull.');
 return runtime.environment;
}
module.exports={findContainerRuntime,requireContainerRuntime};
