const fs=require('fs');const path=require('path');const assert=require('assert/strict');
assert.equal(fs.readFileSync(path.join(__dirname,'../generated/NativeletShatterSpecsJSI.h'),'utf8'),fs.readFileSync(process.argv[2],'utf8'));
console.log('PASS checked-in C++ Codegen header equals freshly generated schema output');
