// Optimize stored project logos without changing any other project fields.
// Defaults to a read-only plan. Use --apply to save smaller replacements.
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
async function optimizeStoredLogos({rows,compress,save,apply=false}){
 const result={scanned:rows.length,updated:0,candidates:0,unchanged:0,unsupported:0,conflicts:0,failed:0,bytesSaved:0};const cache=new Map();
 for(const row of rows){
  const original=row.logo_data_url;
  if(!/^data:image\/(png|jpeg|webp);base64,/.test(original||'')){result.unsupported++;continue;}
  try{
   if(!cache.has(original))cache.set(original,compress(original));
   const optimized=await cache.get(original);
   if(!optimized||Buffer.byteLength(optimized)>=Buffer.byteLength(original)){result.unchanged++;continue;}
   result.candidates++;
   if(apply&&!await save(row,optimized)){result.conflicts++;continue;}
   if(apply)result.updated++;
   result.bytesSaved+=Buffer.byteLength(original)-Buffer.byteLength(optimized);
  }catch{result.failed++;}
 }
 return result;
}
async function main(){
 const root=path.resolve(__dirname,'..');
 for(const file of ['.env.local','.env']){const full=path.join(root,file);if(fs.existsSync(full))process.loadEnvFile(full);}
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Database service access is not configured.');
 const {createClient}=require('@supabase/supabase-js');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),rows=[];
 for(let offset=0;;offset+=100){const {data,error}=await client.from('projects').select('id,external_id,revision,logo_data_url').not('logo_data_url','is',null).order('id').range(offset,offset+99);if(error)throw new Error(`Could not load stored logos: ${error.message}`);rows.push(...data);if(data.length<100)break;}
 const apply=process.argv.includes('--apply');let backup;
 if(apply&&rows.length){backup=path.join(os.tmpdir(),`pms-original-logos-${Date.now()}-${crypto.randomUUID()}.json`);fs.writeFileSync(backup,JSON.stringify({createdAt:new Date().toISOString(),projects:rows}),{mode:0o600,flag:'wx'});}
 const {chromium}=require('@playwright/test'),ts=require('typescript');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  const source=ts.transpileModule(fs.readFileSync(path.join(root,'lib/image-compression.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  await page.addScriptTag({content:`const exports={};${source};window.optimizeLogo=exports.compressImage;`});
  const result=await optimizeStoredLogos({rows,apply,
   compress:async original=>page.evaluate(async original=>{
    const blob=await (await fetch(original)).blob();
    // Avoid repeatedly recompressing an already optimized lossy image.
    if(blob.type==='image/webp'&&blob.size<=100*1024){const image=new Image();image.src=original;await image.decode();if(Math.max(image.naturalWidth,image.naturalHeight)<=384)return null;}
    return (await window.optimizeLogo(new File([blob],'stored-logo',{type:blob.type}),{maxDimension:384,maxBytes:100*1024})).dataUrl;
   },original),
   save:async(row,optimized)=>{
    if(!Number.isSafeInteger(row.revision))throw new Error('Project revision is missing.');
    const {data,error}=await client.from('projects').update({logo_data_url:optimized,revision:row.revision+1}).eq('id',row.id).eq('revision',row.revision).select('id,revision,logo_data_url');
    if(error)throw error;
    return data.length===1&&data[0].logo_data_url===optimized&&data[0].revision===row.revision+1;
   }
  });
  process.stdout.write(JSON.stringify({mode:apply?'applied':'dry-run',...result,backup:backup||null},null,2)+'\n');
  if(result.failed||result.conflicts)process.exitCode=1;
 }finally{await browser.close();}
}
module.exports={optimizeStoredLogos};
if(require.main===module)main().catch(error=>{process.stderr.write((error instanceof Error?error.message:'Logo optimization failed.')+'\n');process.exitCode=1;});
