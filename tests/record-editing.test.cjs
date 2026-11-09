const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canEditRecordDetails,parseServiceDetails,linkedCustomerLeadIds}=require('../scripts/test-loader.cjs').createLoader()('lib/record-editing.ts');
test('record editing is limited to admins and project managers',()=>{
 for(const role of ['admin','project_manager'])assert.equal(canEditRecordDetails(role),true);
 for(const role of ['employee','client',undefined,null,'owner'])assert.equal(canEditRecordDetails(role),false);
});
test('customer edits target linked records and exact emails, never similar names',()=>{
 const leads=[{id:'L1',email:'old@example.com'},{id:'L2',email:' Customer@Example.com '},{id:'L3',email:'other@example.com',projectId:'P1'},{id:'L4',email:'customer2@example.com'}];
 assert.deepEqual(linkedCustomerLeadIds({email:'customer@example.com',projects:[{id:'P1'}]},[{id:'P1',leadId:'L1'},{id:'P2',leadId:'L4'}],leads),['L1','L2','L3']);
 assert.deepEqual(linkedCustomerLeadIds({projects:[]},[],leads),[]);
});
test('service editing keeps authored names and removes duplicates and generic Multiple',()=>{
 assert.deepEqual(parseServiceDetails(' Website, CRM\nwebsite, Multiple, ,Booking engine'),['Website','CRM','Booking engine']);
});
test('project edits cannot save contradictory service titles and selections',()=>{
 const {validateProjectServiceDetails}=require('../scripts/test-loader.cjs').createLoader()('lib/record-editing.ts');
 assert.throws(()=>validateProjectServiceDetails('Website',['Website','CRM']),/must match/);
 assert.doesNotThrow(()=>validateProjectServiceDetails('Website & CRM',['Website','CRM']));
 assert.doesNotThrow(()=>validateProjectServiceDetails('Hotel delivery',['Website','CRM']));
});
