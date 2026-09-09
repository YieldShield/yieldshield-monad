/** Generate immutable Base modules from the unchanged, imported YieldShield implementations.
 * Each module retains identical storage and ABI, but compiles only its selected entry points
 * and their transitive dependencies. Unselected explicit entry points are reverting stubs;
 * compiler-generated getters and inherited methods remain present. The immutable
 * router dispatches every original selector exactly once. No owner can change its routing.
 * Run after compiling the original sources: node scripts/generate-base-modules.mjs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out=resolve(root,'contracts/contracts/base-modules');
mkdirSync(out,{recursive:true});
function mask(s) { return s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, m=>m.replace(/[^\n]/g,' ')); }
// Include inherited methods and modifiers in reachability: e.g. whenNotPaused ->
// _requireNotPaused -> the pool's overridden paused(). Internal/private functions
// remain intact, but only reachable bodies are dependency roots.
const inheritedFiles = [
 'contracts/contracts/base/ProtocolAccessControlUpgradeable.sol',
 'contracts/lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol',
 'contracts/lib/openzeppelin-contracts-upgradeable/contracts/access/OwnableUpgradeable.sol',
 'contracts/lib/openzeppelin-contracts-upgradeable/contracts/utils/PausableUpgradeable.sol',
 'contracts/lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol',
 'contracts/lib/openzeppelin-contracts/contracts/proxy/utils/Initializable.sol',
 'contracts/lib/openzeppelin-contracts/contracts/proxy/utils/UUPSUpgradeable.sol',
 'contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol',
 'contracts/lib/openzeppelin-contracts-upgradeable/contracts/utils/ContextUpgradeable.sol',
];
function declarations(source) {
 const clean=mask(source), declarations=[];
 const rx=/^    (function|modifier)\s+(\w+)\s*([^{}]*?)\{/gm;
 for(const match of clean.matchAll(rx)) {
  const bodyStart=match.index+match[0].length-1;
  let depth=1,end=bodyStart+1;
  while(depth && end<clean.length) { if(clean[end]==='{')depth++;if(clean[end]==='}')depth--;end++; }
  if(depth)throw Error('Unbalanced Solidity declaration '+match[2]);
  declarations.push({kind:match[1],name:match[2],start:match.index,bodyStart,end,head:clean.slice(match.index,bodyStart),body:clean.slice(bodyStart,end)});
 }
 return declarations;
}
const inherited=inheritedFiles.flatMap(path=>declarations(readFileSync(resolve(root,path),'utf8')));
const assignments={
 SplitRiskPool: {
  Initialize: ['initialize','initializeWithAccessControl'],
  Deposits: ['depositBackingAsset','depositShieldedAsset'],
  ShieldExit: ['shieldedWithdraw'],
  PartialExit: ['partialWithdrawShielded','claimRewards'],
  Protector: ['protectorWithdraw','startUnlockProcess','cancelUnlockProcess'],
  Fees: ['payPoolFee','payProtocolFee','claimCommission','forfeitCommission','settleExpiredProtectorPosition','escrowExpiredProtectorCommission','claimExpiredProtectorBacking','settleExpiredProtectorBacking'],
 },
 SplitRiskPoolFactory: {
  Create: ['createPool','createPoolWithAccessControl'],
  Oracle: ['setCompositeOracle','setManagedPythOracle','setManagedERC4626OracleFeed','transferManagedOracleOwnership','setCompositeOracleAuthorizedCaller','setCompositeOracleDeviationThreshold','setCompositeOracleChallengeDuration','setCompositeOracleTokenFeed','setCompositeOracleTokenFeedDual','scheduleCompositeOracleTokenFeedRemoval','cancelScheduledCompositeOracleTokenFeedRemoval','removeCompositeOracleTokenFeed','scheduleCompositeOracleForceResetToPrimary','executeCompositeOracleForceResetToPrimary','scheduleCompositeOracleEmergencyCancelChallenge','executeCompositeOracleEmergencyCancelChallenge','cancelCompositeOracleScheduledOverride','setPythTokenPriceFeed','setPythTokenCompositePriceFeed','schedulePythTokenRemoval','cancelScheduledPythTokenRemoval','removePythToken','setPythMaxPriceAge','setPythMaxPriceAgeForToken','setPythMaxPriceAgeForFeedId','setPythMaxCompositePublishTimeSkew','setPythMaxPriceDeviation','setPythMaxConfidenceBps','setPythMaxEmaConfidenceBps','setERC4626UnderlyingPriceOracle','registerERC4626Vault','scheduleERC4626VaultSharePriceReferenceRefresh','cancelScheduledERC4626VaultSharePriceReferenceRefresh','refreshERC4626VaultSharePriceReference','setERC4626VaultSharePriceDeviation','scheduleERC4626VaultRemoval','cancelScheduledERC4626VaultRemoval','removeERC4626Vault'],
  Lifecycle: ['deactivatePool','deactivateDustPool','deactivateProtectorOnlyPool','closePool','closePoolTo','removeToken'],
 }
};
const report={};
for (const original of Object.keys(assignments)) {
 const source=readFileSync(resolve(root,'contracts/contracts',original+'.sol'),'utf8');
 const masked=mask(source);
 const begin=masked.indexOf('contract '+original+' ');
 const funcs=declarations(source).filter(f=>f.start>begin && f.kind==='function');
 const ownDeclarations=declarations(source).filter(f=>f.start>begin);
 const byName=new Map(funcs.map(f=>[f.name,f]));
 if(byName.size!==funcs.length)throw Error('Overloaded implementation function needs explicit handling');
 const dependencyNodes=[...ownDeclarations,...inherited];
 const artifact=JSON.parse(readFileSync(resolve(root,'contracts/out',original+'.sol',original+'.json'),'utf8'));
 const mapping={};
 for(const abi of artifact.abi.filter(a=>a.type==='function')) {
  let group=['view','pure'].includes(abi.stateMutability)?'Views':'Admin';
  for(const [g,names] of Object.entries(assignments[original]))if(names.includes(abi.name))group=g;
  if(mapping[abi.name] && mapping[abi.name]!==group)throw Error('Conflicting overload routing');
  mapping[abi.name]=group;
 }
 const groups=[...new Set(Object.values(mapping))].sort();
 const typePrefix=original==='SplitRiskPool'?'BasePool':'BaseFactory';
 const modules={};
 for(const group of groups) {
  const keep=new Set(Object.entries(mapping).filter(([,g])=>g===group).map(([n])=>n));
  // Parent implementations can dispatch to local overrides. Trace both bodies
  // conservatively, including modifier use without parentheses. Retain original
  // internal overrides such as _authorizeUpgrade even for inherited entry points.
  for(const f of funcs)if(/\b(internal|private)\b/.test(f.head) && /\boverride\b/.test(f.head))keep.add(f.name);
  let changed=true;
  while(changed) {changed=false;for(const node of dependencyNodes) {
   if(!keep.has(node.name))continue;
   for(const candidate of dependencyNodes)if(new RegExp('\\b'+candidate.name+'\\b').test(node.head+node.body) && !keep.has(candidate.name)) {keep.add(candidate.name);changed=true;}
  }}
  // Internal helpers are preserved exactly; unused helpers disappear in compiler optimization.
  // Only public/external functions absent from the closure become deliberate reverting stubs.
  let code=source;
  for(const f of [...funcs].reverse()) {
   if(!keep.has(f.name) && /\b(public|external)\b/.test(f.head))code=code.slice(0,f.bodyStart)+'{ revert BaseModuleSelectorUnavailable(); }'+code.slice(f.end);
  }
  const name=typePrefix+group+'Module';
  code=code.replace('contract '+original+' ','contract '+name+' ')
   .replace(/from "\.\//g,'from "../');
  const pos=code.indexOf('{',code.indexOf('contract '+name+' '));
  code=code.slice(0,pos+1)+'\n    error BaseModuleSelectorUnavailable();\n'+code.slice(pos+1);
  code='// GENERATED by scripts/generate-base-modules.mjs. Edit the upstream implementation, then regenerate.\n'+code;
  writeFileSync(resolve(out,name+'.sol'),code);
  modules[group]={contract:name,retainedFunctions:funcs.filter(f=>keep.has(f.name)).map(f=>f.name),entryPoints:Object.entries(mapping).filter(([,g])=>g===group).map(([n])=>n)};
 }
 const router=typePrefix+'Router';
 const selectors=Object.entries(artifact.methodIdentifiers);
 const conditions=groups.map(g=>{
  const sigs=selectors.filter(([sig])=>mapping[sig.slice(0,sig.indexOf('('))]===g && !sig.startsWith('proxiableUUID(') && !sig.startsWith('upgradeToAndCall('));
  return sigs.length?'        if ('+sigs.map(([sig,sel])=>'selector == 0x'+sel+' /* '+sig+' */').join(' ||\n            ')+') return '+g.toLowerCase()+'Module;':'';
 }).filter(Boolean).join('\n');
 const routerCode='// SPDX-License-Identifier: MIT\npragma solidity ^0.8.35;\nimport { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";\n'+
 '/// @notice Immutable dispatch preserving the original YieldShield ABI and storage.\n'+
 '/// @dev No routing changes, arbitrary delegate targets, or upgrades are available.\n'+
 'contract '+router+' is Initializable {\n'+
 '    error UnknownSelector(bytes4 selector);\n    error InvalidModule();\n    error DelegatedUUID();\n'+
 '    error UpgradeDisabled();\n'+
 '    address private immutable SELF = address(this);\n'+
 groups.map(g=>'    address public immutable '+g.toLowerCase()+'Module;').join('\n')+'\n'+
 '    constructor('+groups.map(g=>'address '+g.toLowerCase()+'_').join(', ')+') {\n'+
 groups.map(g=>'        if ('+g.toLowerCase()+'_.code.length == 0) revert InvalidModule();\n        '+g.toLowerCase()+'Module = '+g.toLowerCase()+'_;').join('\n')+'\n        _disableInitializers();\n    }\n'+
 '    function proxiableUUID() external view returns (bytes32) {\n        if (address(this) != SELF) revert DelegatedUUID();\n        return 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;\n    }\n'+
 '    function upgradeToAndCall(address, bytes calldata) external payable { revert UpgradeDisabled(); }\n'+
 '    function moduleForSelector(bytes4 selector) public view returns (address) {\n'+conditions+'\n        revert UnknownSelector(selector);\n    }\n'+
 '    fallback() external payable {\n        address target = moduleForSelector(msg.sig);\n        assembly ("memory-safe") {\n            calldatacopy(0, 0, calldatasize())\n            let success := delegatecall(gas(), target, 0, calldatasize(), 0, 0)\n            returndatacopy(0, 0, returndatasize())\n            switch success case 0 { revert(0, returndatasize()) } default { return(0, returndatasize()) }\n        }\n    }\n}\n';
 writeFileSync(resolve(out,router+'.sol'),routerCode);
 report[original]={sourceSha256:createHash('sha256').update(source).digest('hex'),router,modules,selectors:artifact.methodIdentifiers};
}
writeFileSync(resolve(root,'contracts/config/base-modules.json'),JSON.stringify(report,null,2)+'\n');
console.log('Generated Base modules and exhaustive immutable selector routing.');
