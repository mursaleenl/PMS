const {test}=require('node:test');const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
const {attendanceScanPath}=createLoader()('lib/attendance-scan.ts');
test('attendance scanner only opens valid confirmation paths on this workspace',()=>{
 const origin='https://work.example',path='/work/attendance/88888888-8888-8888-8888-888888888888';
 assert.equal(attendanceScanPath(origin+path,origin),path);
 assert.equal(attendanceScanPath(path,origin),path);
 for(const value of ['https://evil.example'+path,'javascript:alert(1)','//evil.example'+path,'/work/attendance/office','/work/attendance/not-a-token',origin+path+'?redirect=https://evil.example',origin+path+'#x','https://user:password@work.example'+path])assert.equal(attendanceScanPath(value,origin),null,value);
});
