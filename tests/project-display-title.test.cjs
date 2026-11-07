const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
const {getProjectDisplayTitle}=createLoader()('lib/projects.ts');

test('project headings skip placeholder company names and retain real company names',()=>{
 assert.equal(getProjectDisplayTitle({clientCompany:'None',clientName:'Mursaleen',title:'Branding'}),'Mursaleen');
 assert.equal(getProjectDisplayTitle({clientCompany:' N/A ',clientName:'None',title:'Branding'}),'Branding');
 assert.equal(getProjectDisplayTitle({clientCompany:'Zerogrid LLC',clientName:'Mursaleen',title:'Website'}),'Zerogrid LLC');
});
