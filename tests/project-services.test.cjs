const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getProjectServices,getInheritedInvoiceDescription}=require('../scripts/test-loader.cjs').createLoader()('lib/project-services.ts');
const project={title:'Website',clientCompany:'Hotel Shady Oaks',services:['Branding','Website','CRM','Multiple']};
test('website project narrows the inherited enquiry services',()=>{
 assert.deepEqual(getProjectServices(project),['Website']);
 assert.deepEqual(getProjectServices({...project,title:'Hotel Shady Oaks — Website'}),['Website']);
});
test('explicit multi-service projects retain their actual services',()=>{
 assert.deepEqual(getProjectServices({...project,title:'Branding & Website'}),['Branding','Website']);
 assert.deepEqual(getProjectServices({...project,title:'Hotel Shady Oaks'}),['Branding','Website','CRM']);
 assert.deepEqual(getProjectServices({title:'Internal project'}),[]);
});
test('project invoices inherit project scope then lead description then resolved services',()=>{
 assert.equal(getInheritedInvoiceDescription({...project,scopeIncluded:'Website with booking engine'}, {description:'Original enquiry'}),'Website with booking engine');
 assert.equal(getInheritedInvoiceDescription(project,{description:'Hotel website delivery'}),'Hotel website delivery');
 assert.equal(getInheritedInvoiceDescription(project),'Website');
 assert.equal(getInheritedInvoiceDescription({...project,scopeIncluded:'  '},{description:'  '}),'Website');
});
