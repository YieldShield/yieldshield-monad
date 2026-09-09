/** Verify compiled modules preserve original ABI/storage and obey Base deployment limits.
 * Run forge build --extra-output storageLayout first; refuses stale generated sources.
 * --check performs the same verification without updating the generated report.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2);
assert(args.length<=1&&args.every(arg=>arg==='--check'),'Usage: node scripts/verify-base-modules.mjs [--check]');
const checkOnly=args.includes('--check');
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report=JSON.parse(readFileSync(resolve(root,'contracts/config/base-modules.json')));
const sourceDigests=new Map();
const artifact=(name)=>{
 const a=JSON.parse(readFileSync(resolve(root,`contracts/out/${name}.sol/${name}.json`)));
 for(const [path,source] of Object.entries(a.metadata.sources)) {
  if(!sourceDigests.has(path))sourceDigests.set(path,keccak256(readFileSync(resolve(root,'contracts',path))));
  assert.equal(source.keccak256,sourceDigests.get(path),`${name}: stale compiler artifact for ${path}; rebuild`);
 }
 return a;
};
const cleanLabel=(label)=>label.replace(/\b(?:SplitRiskPool(?:Factory)?|Base(?:Pool|Factory)\w+Module)\./g,'Implementation.');
function layout(a) {
 assert(a.storageLayout,'Compile with --extra-output storageLayout');
 const describe=(id)=>{
  const t=a.storageLayout.types[id];
  const result={encoding:t.encoding,label:cleanLabel(t.label),numberOfBytes:t.numberOfBytes};
  if(t.members)result.members=t.members.map(m=>({label:m.label,slot:m.slot,offset:m.offset,type:describe(m.type)}));
  for(const key of ['key','value','base'])if(t[key])result[key]=describe(t[key]);
  return result;
 };
 return a.storageLayout.storage.map(s=>({label:s.label,slot:s.slot,offset:s.offset,type:describe(s.type)}));
}
const sizes=[];
for(const [original,config] of Object.entries(report)) {
 assert.equal(createHash('sha256').update(readFileSync(resolve(root,`contracts/contracts/${original}.sol`))).digest('hex'),config.sourceSha256,`${original}: regenerate after source changes`);
 const baseline=artifact(original), baselineLayout=layout(baseline), router=artifact(config.router);
 assert.deepEqual(config.selectors,baseline.methodIdentifiers,`${original}: selector manifest differs from compiler`);
 const originalSelectors=new Set(Object.values(baseline.methodIdentifiers));
 for(const [signature,selector] of Object.entries(router.methodIdentifiers)) {
  assert(!originalSelectors.has(selector)||['proxiableUUID()','upgradeToAndCall(address,bytes)'].includes(signature),`${signature}: router shadows original selector`);
 }
 assert.equal(router.storageLayout.storage.length,0,`${config.router}: routing must not consume sequential storage`);
 const checkedNames=new Set();
 for(const module of Object.values(config.modules)) {
  const a=artifact(module.contract);
  assert.deepEqual(layout(a),baselineLayout,`${module.contract}: changed storage layout`);
  assert.deepEqual(a.methodIdentifiers,baseline.methodIdentifiers,`${module.contract}: changed original ABI selectors`);
  for(const n of module.entryPoints){assert(!checkedNames.has(n),`${n}: duplicate routing`);checkedNames.add(n);}
 }
 for(const signature of Object.keys(baseline.methodIdentifiers))assert(checkedNames.has(signature.slice(0,signature.indexOf('('))),`${signature}: missing route`);
 for(const name of [config.router,...Object.values(config.modules).map(m=>m.contract)]) {
  const a=artifact(name), runtime=(a.deployedBytecode.object.length-2)/2,initcode=(a.bytecode.object.length-2)/2;
  assert(runtime<=24576,`${name}: runtime ${runtime} exceeds 24576`);
  // Router constructor arguments count toward the actual EIP-3860 initcode size.
  const constructorWords=name===config.router?Object.keys(config.modules).length:0;
  assert(initcode+32*constructorWords<=49152,`${name}: initcode exceeds 49152`);
  sizes.push({contract:name,runtimeBytes:runtime,initcodeBytes:initcode+32*constructorWords});
 }
 console.log(`${original}: exact storage layout and ${originalSelectors.size} selectors preserved across ${Object.keys(config.modules).length} modules.`);
}
if(!checkOnly)writeFileSync(resolve(root,'contracts/config/base-module-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),runtimeLimit:24576,initcodeLimit:49152,contracts:sizes},null,2)+'\n');
console.log(`All ${sizes.length} routers/modules satisfy Base size limits. Largest runtime: ${Math.max(...sizes.map(s=>s.runtimeBytes))} bytes.`);
