// Harness regression for the observed Android recovery failure: BACK while the
// showcase is foreground destroys the app task and leaves the launcher resumed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const script=fs.readFileSync(path.resolve(__dirname,'../../../../../scripts/android-system-ready.sh'),'utf8');
const body=script.match(/recover_system\(\)\{([\s\S]*?)\n\}/);
assert(body,'recover_system function missing');
assert(!body[1].includes('KEYCODE_BACK'),'recovery must not BACK out of the app under test');
const targetStop=body[1].indexOf('am force-stop "$PKG"');
const relaunch=body[1].indexOf('am start -W');
assert(targetStop>=0,'recovery must force-stop the stuck target before relaunch');
assert(relaunch>targetStop,'recovery must cold-relaunch the target after force-stop');
console.log(JSON.stringify({harnessRecovery:'PASS',scope:'source regression for foreground target preservation; not an emulator pass'},null,2));
