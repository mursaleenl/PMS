const {test}=require('node:test');const assert=require('node:assert/strict');const {optimizeStoredLogos}=require('../scripts/compress-existing-logos.cjs');
const image='data:image/png;base64,'+'A'.repeat(1000),smaller='data:image/webp;base64,'+'A'.repeat(100);
test('stored logo maintenance plans without writes and compresses shared originals once',async()=>{
 let conversions=0,saves=0;const result=await optimizeStoredLogos({rows:[{id:'one',logo_data_url:image},{id:'two',logo_data_url:image}],compress:async()=>{conversions++;return smaller;},save:async()=>{saves++;return true;}});assert.equal(conversions,1);assert.equal(saves,0);assert.equal(result.candidates,2);assert.equal(result.updated,0);assert.equal(result.bytesSaved,2*(Buffer.byteLength(image)-Buffer.byteLength(smaller)));
});
test('stored logo maintenance writes only smaller logos and preserves concurrent edits',async()=>{
 const rows=[{id:'changed',revision:1,logo_data_url:image},{id:'saved',revision:2,logo_data_url:image},{id:'small',logo_data_url:'data:image/png;base64,AA=='},{id:'external',logo_data_url:'/internal-project-logo.png'}];const writes=[];
 const result=await optimizeStoredLogos({rows,apply:true,compress:async src=>src===image?smaller:src,save:async(row,data)=>{writes.push({row,data});return row.id==='saved';}});
 assert.deepEqual(writes.map(write=>write.row.id),['changed','saved']);assert.equal(result.updated,1);assert.equal(result.conflicts,1);assert.equal(result.unchanged,1);assert.equal(result.unsupported,1);assert.equal(result.bytesSaved,Buffer.byteLength(image)-Buffer.byteLength(smaller));
});
test('a damaged logo does not prevent other valid logos from being saved',async()=>{
 const bad='data:image/png;base64,BAD';const result=await optimizeStoredLogos({rows:[{id:'bad',logo_data_url:bad},{id:'good',logo_data_url:image}],apply:true,compress:async src=>{if(src===bad)throw new Error('Bad image');return smaller;},save:async()=>true});assert.equal(result.failed,1);assert.equal(result.updated,1);
});
