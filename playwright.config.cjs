const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'./tests/browser',testMatch:'**/*.spec.cjs',workers:1,timeout:45000,use:{baseURL:process.env.PMS_TEST_URL||'http://localhost:3000',viewport:{width:1440,height:1000},headless:true},reporter:'list'});
