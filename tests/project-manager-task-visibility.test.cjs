const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLoader}=require('../scripts/test-loader.cjs');
const {canViewProjectTask}=createLoader()('lib/projects.ts');
const project={team:[{role:'Project Manager',userId:'manager',name:'Manager'}]};
const task={assigneeId:'employee',assignee:'Employee'};
test('project managers oversee workspace tasks while employee visibility stays scoped',()=>{
 assert.equal(canViewProjectTask(project,task,'project_manager','manager','Manager'),true);
 assert.equal(canViewProjectTask(project,task,'project_manager','other','Other'),true);
 assert.equal(canViewProjectTask(project,task,'project_manager','other','Manager'),true);
 assert.equal(canViewProjectTask(project,task,'employee','employee','Employee'),true);
 assert.equal(canViewProjectTask(project,task,'employee','other','Other'),false);
 assert.equal(canViewProjectTask(project,task,'client','employee','Employee'),false);
 assert.equal(canViewProjectTask(project,task,'admin','admin'),true);
 assert.equal(canViewProjectTask({team:[]},task,'project_manager','employee','Employee'),true);
 assert.equal(canViewProjectTask({team:[{role:'Project Manager',name:'Manager'}]},task,'project_manager','manager','Manager'),true);
});
