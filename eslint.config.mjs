import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {FlatCompat}=require('@eslint/eslintrc');
const compat=new FlatCompat({baseDirectory:import.meta.dirname});
const config = [
 {ignores:[".next/**","node_modules/**","next-env.d.ts","tests/**","scripts/**","playwright.config.cjs"]},
 ...compat.extends('next/core-web-vitals','next/typescript'),
 {rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':'warn','react/no-unescaped-entities':'off','@next/next/no-img-element':'off'}},
];

export default config;
