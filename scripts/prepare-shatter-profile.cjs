// Diagnostic-only app temp path for the built-in Worklets Hermes trace writer.
const fs = require('fs');
const path = require('path');
function walk(p) { for (const e of fs.readdirSync(p, {withFileTypes:true})) { const f=path.join(p,e.name); if(e.isDirectory())walk(f);else if(e.name==='MainApplication.kt'){let s=fs.readFileSync(f,'utf8'); if(!s.includes('SHATTER_PROFILE_TMPDIR')){s=s.replace('super.onCreate()', 'super.onCreate()\n    // SHATTER_PROFILE_TMPDIR: diagnostic build only\n    android.system.Os.setenv("TMPDIR", cacheDir.absolutePath, true)');fs.writeFileSync(f,s); console.log('Configured diagnostic cache TMPDIR:',f);}}}}
walk('apps/showcase/android/app/src/main');
