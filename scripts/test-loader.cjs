const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
exports.createLoader=(overrides={})=>{
  const cache={};
  function load(filename) {
    const full=path.resolve(filename);
    if(cache[full])return cache[full].exports;
    const module={exports:{}}; cache[full]=module;
    const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const localRequire=name=>Object.hasOwn(overrides,name)?overrides[name]:name.startsWith('@/')?load(name.slice(2)+(fs.existsSync(name.slice(2)+'.ts')?'.ts':'.tsx')):require(name);
    new Function('require','module','exports',code)(localRequire,module,module.exports);
    return module.exports;
  }
  return load;
};
