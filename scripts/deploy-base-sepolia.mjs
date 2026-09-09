#!/usr/bin/env node
/** Reviewed, sequential Base Sepolia alpha bootstrap. Default: prepare only; never broadcasts without --broadcast.
 * Secrets are read from ignored contracts/.env.base.local and are never serialized/logged.
 * Resume uses the same signed transaction hash; an ambiguous nonce is a hard stop.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPublicClient, http, encodeDeployData, encodeFunctionData, getContractAddress, getAddress, keccak256, parseEventLogs, parseEther, toHex, zeroAddress, zeroHash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let currentStage='startup';
const CHAIN_ID=84532, SOURCE_CHAIN_ID=8453, DAY=86400n, IMPLEMENTATION_SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const stringify=(value)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const sha=(value)=>createHash('sha256').update(typeof value==='string'?value:stringify(value)).digest('hex');
export function acquireDeploymentLock(path) {
 const descriptor=openSync(path,'wx',0o600);writeFileSync(descriptor,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));closeSync(descriptor);
 let active=true;return ()=>{if(active){active=false;unlinkSync(path);}};
}
const sameAddress=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function atomicJson(path,value) { mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.tmp',stringify(value),{mode:0o600});renameSync(path+'.tmp',path); }
export function linkBytecode(bytecode,references,addresses) {
 let result=bytecode;
 for(const [file,libraries] of Object.entries(references||{}))for(const [name,offsets] of Object.entries(libraries)) {
  const address=addresses[`${file}:${name}`];assert(address,`Missing library ${file}:${name}`);
  for(const {start,length} of offsets) {assert.equal(length,20);const offset=2+start*2;result=result.slice(0,offset)+address.slice(2).toLowerCase()+result.slice(offset+length*2);}
 }
 assert(/^0x[0-9a-fA-F]*$/.test(result),'Unresolved artifact links');return result;
}
export function assertRuntimeMatches(artifact,actual,address,links) {
 let expected=linkBytecode(artifact.deployedBytecode.object,artifact.deployedBytecode.linkReferences,links);
 assert.equal(actual.length,expected.length,'Deployed runtime length differs from artifact');
 // Solidity library constructors patch their own address in the leading PUSH20.
 if(expected.startsWith('0x73'+'0'.repeat(40)))expected='0x73'+address.slice(2).toLowerCase()+expected.slice(44);
 for(const entries of Object.values(artifact.deployedBytecode.immutableReferences||{}))for(const {start,length} of entries) {
  const offset=2+start*2,zeros='0'.repeat(length*2);
  expected=expected.slice(0,offset)+zeros+expected.slice(offset+length*2);
  actual=actual.slice(0,offset)+zeros+actual.slice(offset+length*2);
 }
 assert.equal(actual.toLowerCase(),expected.toLowerCase(),'Deployed runtime differs from reviewed artifact');
}
function artifact(name) {
 const path=resolve(ROOT,`contracts/out/${name}.sol/${name}.json`),a=JSON.parse(readFileSync(path,'utf8'));
 for(const [source,metadata] of Object.entries(a.metadata.sources))assert.equal(keccak256(readFileSync(resolve(ROOT,'contracts',source))),metadata.keccak256,`Stale artifact ${name}: ${source}; rebuild first`);
 return a;
}
function loadEnv() {
 const path=resolve(ROOT,'contracts/.env.base.local');
 assert(existsSync(path),'Missing ignored contracts/.env.base.local');
 execFileSync('git',['check-ignore','--quiet',path],{cwd:ROOT,stdio:'ignore'});
 const values={};for(const line of readFileSync(path,'utf8').split(/\r?\n/)) {const match=line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);if(match){let v=match[2].trim();if((v[0]==='"'&&v.at(-1)==='"')||(v[0]==="'"&&v.at(-1)==="'"))v=v.slice(1,-1);values[match[1]]=v;}}
 return {...values,...process.env};
}
function toRequest(value) {const req={...value};for(const key of ['gas','maxFeePerGas','maxPriorityFeePerGas','value'])if(req[key]!==undefined)req[key]=BigInt(req[key]);return req;}
function assertReceiptIdentity(receipt,hash,id) {assert.equal(receipt?.transactionHash,hash,`${id}: receipt transaction hash does not match saved transaction`);}
/** Read sealed canonical receipts explicitly; confirmation waiters can retain preconfirmation data. */
export async function readCanonicalReceipt(client,hash,id) {
 const checkReceipt=receipt=>{
  assertReceiptIdentity(receipt,hash,id);assert.equal(receipt.status,'success',`${id}: transaction reverted`);
  assert(typeof receipt.blockNumber==='bigint'&&receipt.blockNumber>0n,`${id}: invalid receipt block number`);
  assert(/^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash??'')&&receipt.blockHash!==zeroHash,`${id}: receipt block hash is not sealed`);
  assert(Number.isSafeInteger(receipt.transactionIndex)&&receipt.transactionIndex>=0,`${id}: invalid receipt transaction index`);
 };
 const checkBlock=(receipt,block)=>{
  assert.equal(block.number,receipt.blockNumber,`${id}: canonical block height mismatch`);
  assert.equal(block.hash,receipt.blockHash,`${id}: receipt differs from canonical block`);
  assert.equal(block.transactions?.[receipt.transactionIndex],hash,`${id}: transaction missing from canonical block`);
 };
 const receipt=await client.getTransactionReceipt({hash});checkReceipt(receipt);
 checkBlock(receipt,await client.getBlock({blockNumber:receipt.blockNumber}));
 const head=await client.getBlock({blockTag:'latest'});
 assert(typeof head.number==='bigint'&&head.number>=receipt.blockNumber+1n,`${id}: two sealed block confirmations required`);
 assert(/^0x[0-9a-fA-F]{64}$/.test(head.hash??'')&&head.hash!==zeroHash,`${id}: latest block is not sealed`);
 const fresh=await client.getTransactionReceipt({hash});checkReceipt(fresh);
 assert.equal(fresh.blockNumber,receipt.blockNumber,`${id}: receipt moved during confirmation`);
 assert.equal(fresh.blockHash,receipt.blockHash,`${id}: receipt reorged during confirmation`);
 checkBlock(fresh,await client.getBlock({blockNumber:fresh.blockNumber}));
 return fresh;
}
function maximumExecutionCost(request) {
 const gas=BigInt(request.gas),fee=BigInt(request.maxFeePerGas);
 assert(gas>0n&&fee>=0n,'Invalid saved transaction gas or maximum fee');return gas*fee;
}

export class SequentialDeployment {
 constructor({client,account,broadcast,manifestPath,manifest,nonce,maxFeePerGas,spendLimit}) {Object.assign(this,{client,account,broadcast,manifestPath,manifest,maxFeePerGas,spendLimit});this.cursor=nonce;this.plan=[];this.links={};this.preparedResults=new Map();}
 save(){if(this.broadcast)atomicJson(this.manifestPath,this.manifest);}
 async assertSubmissionLimits(request,additionalRequest=false) {
  const maximumCost=maximumExecutionCost(request);
  assert(BigInt(request.gas)<=16000000n,'Transaction exceeds conservative Base gas cap');
  assert(BigInt(request.maxFeePerGas)<=this.maxFeePerGas,'Transaction fee exceeds configured deployment cap');
  // Derive the reservation from signed request fields, never editable summary metadata.
  const reserved=Object.values(this.manifest.transactions).reduce((n,t)=>n+maximumExecutionCost(t.request),0n);
  assert(reserved+(additionalRequest?maximumCost:0n)<=this.spendLimit,'Deployment cumulative maximum fee budget exceeded');
  assert(await this.client.getBalance({address:this.account.address})>=maximumCost+parseEther('0.0001'),'Insufficient test ETH including L1 fee reserve');
 }
 async transaction(id,{to,data,kind='call'}) {
  currentStage=id;
  const intent={chainId:CHAIN_ID,from:this.account.address,to:to??null,data,value:'0'},intentHash=sha(intent);
  const previous=this.manifest.transactions[id];
  if(previous){
   assert.equal(previous.intentHash,intentHash,`Resume intent changed: ${id}`);
   assert.equal(previous.request.chainId,CHAIN_ID,`${id}: persisted transaction chain changed`);
   assert.equal(previous.request.data,data,`${id}: persisted transaction calldata changed`);
   assert.equal(previous.request.to?.toLowerCase(),to?.toLowerCase(),`${id}: persisted transaction target changed`);
   assert.equal(BigInt(previous.request.value),0n,`${id}: unexpected transaction value`);
   if(previous.status==='confirmed')assertReceiptIdentity(previous.receipt,previous.hash,id);
  }
  if(!this.broadcast) {
   if(previous?.status==='confirmed')return previous.receipt;
   const prepared=this.preparedResults.get(id);if(prepared){assert.equal(prepared.intentHash,intentHash,`${id}: conflicting prepared intent`);return prepared.result;}
   const nonce=this.cursor++,entry={id,kind,...intent,nonce};
   if(!to)entry.predictedAddress=getContractAddress({from:this.account.address,nonce:BigInt(nonce)});
   this.plan.push(entry);const result={contractAddress:entry.predictedAddress};this.preparedResults.set(id,{intentHash,result});return result;
  }
  if(previous?.status==='confirmed') {
   assert.equal(keccak256(await this.account.signTransaction(toRequest(previous.request))),previous.hash,`${id}: saved transaction does not match dedicated signer`);
   const receipt=await readCanonicalReceipt(this.client,previous.hash,id);assert.equal(receipt.blockHash,previous.receipt.blockHash,`${id}: confirmed transaction reorged`);assert.equal(receipt.blockNumber,BigInt(previous.receipt.blockNumber),`${id}: confirmed transaction moved`);return receipt;
  }
  let entry=previous;
  if(!entry) {
   const latest=await this.client.getTransactionCount({address:this.account.address,blockTag:'latest'});
   const pending=await this.client.getTransactionCount({address:this.account.address,blockTag:'pending'});
   assert.equal(latest,pending,'Unrelated pending transaction; stop and reconcile before bootstrap');
   const estimated=await this.client.estimateGas({account:this.account,to,data,value:0n});
   const gas=(estimated*120n+99n)/100n;assert(gas<=16000000n,'Transaction exceeds conservative Base gas cap');
   const fees=await this.client.estimateFeesPerGas();
   const request={chainId:CHAIN_ID,type:'eip1559',nonce:latest,to,data,value:0n,gas,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas};
   await this.assertSubmissionLimits(request,true);const maximumCost=maximumExecutionCost(request);
   const serialized=await this.account.signTransaction(request);const hash=keccak256(serialized);
   entry={intentHash,request,hash,maximumCost:maximumCost.toString(),status:'prepared'};
   this.manifest.transactions[id]=entry;this.save(); // Intent/hash durably recorded BEFORE network submission.
  }
  let receipt;
  try {receipt=await this.client.getTransactionReceipt({hash:entry.hash});}catch(error){if(error.name!=='TransactionReceiptNotFoundError')throw error;}
  if(receipt)assertReceiptIdentity(receipt,entry.hash,id);
  if(!receipt) {
   // Operator limits and available funds may have changed since this intent was saved.
   await this.assertSubmissionLimits(entry.request);
   const serialized=await this.account.signTransaction(toRequest(entry.request));assert.equal(keccak256(serialized),entry.hash,'Resume signature/hash mismatch');
   const consumed=await this.client.getTransactionCount({address:this.account.address,blockTag:'latest'});
   assert(consumed<=entry.request.nonce,`${id}: nonce consumed without known receipt; do not resend a new transaction`);
   try {await this.client.sendRawTransaction({serializedTransaction:serialized});}catch(error) {
    // Preserve prepared hash for exact retry; never create a replacement nonce after uncertainty.
    let found;try{found=await this.client.getTransaction({hash:entry.hash});}catch{}
    if(!found)throw error;
   }
   entry.status='submitted';this.save();
  }
  // A cancellation/replacement is never completion of the saved bootstrap intent.
  receipt=await this.client.waitForTransactionReceipt({hash:entry.hash,confirmations:2,checkReplacement:false,timeout:120000,pollingInterval:2000});
  assertReceiptIdentity(receipt,entry.hash,id);
  // Some Base RPCs return the receipt before their latest sealed head catches up.
  // Retry that specific freshness condition; every canonicality and identity check remains mandatory.
  for(let attempt=0;;attempt++) {
   try {receipt=await readCanonicalReceipt(this.client,entry.hash,id);break;}
   catch(error) {
    if(attempt>=10||!String(error.message).includes('two sealed block confirmations required'))throw error;
    await new Promise(resolve=>setTimeout(resolve,2000));
   }
  }
  entry.status='confirmed';entry.receipt={transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,contractAddress:receipt.contractAddress,gasUsed:receipt.gasUsed};this.save();
  console.log(`Confirmed ${id}: ${entry.hash}`);return receipt;
 }
 async deploy(name,artifactName=name,args=[]) {
  const a=artifact(artifactName);
  assert((a.deployedBytecode.object.length-2)/2<=24576,`${artifactName} exceeds Base runtime limit`);
  for(const [file,libraries] of Object.entries(a.bytecode.linkReferences||{}))for(const libraryName of Object.keys(libraries)) {
   const key=`${file}:${libraryName}`;if(!this.links[key])this.links[key]=await this.deploy(libraryName,libraryName,[]);
  }
  const bytecode=linkBytecode(a.bytecode.object,a.bytecode.linkReferences,this.links);
  const data=encodeDeployData({abi:a.abi,bytecode,args});assert((data.length-2)/2<=49152,`${name} exceeds Base initcode limit`);
  const receipt=await this.transaction(`deploy:${name}`,{data,kind:'deployment'});
  const address=getAddress(receipt.contractAddress??this.manifest.contracts[name]?.address);assert(address,`No deployed address for ${name}`);
  if(this.broadcast) {
   const actual=await this.client.getCode({address});assert(actual&&actual!=='0x',`${name}: no deployed code`);
   assertRuntimeMatches(a,actual,address,this.links);
   const original=this.manifest.contracts[name];if(original)assert.equal(original.runtimeCodehash,keccak256(actual),`${name}: runtime changed`);
   this.manifest.contracts[name]={address,artifact:artifactName,txHash:receipt.transactionHash,runtimeCodehash:keccak256(actual),artifactHash:sha(a),constructorArguments:args};this.save();
  }
  return address;
 }
 async write(id,address,name,functionName,args=[]) {return this.transaction(id,{to:address,data:encodeFunctionData({abi:artifact(name).abi,functionName,args})});}
 async read(address,name,functionName,args=[]) {return this.client.readContract({address,abi:artifact(name).abi,functionName,args});}
 async expect(address,name,functionName,args,expected) {if(!this.broadcast)return;const actual=await this.read(address,name,functionName,args);assert.deepEqual(actual,expected,`${name}.${functionName} postcondition`);}
}

function validateCalendar(calendar) {
 assert.equal(calendar.schemaVersion,1);assert(calendar.sources?.length>0,'Calendar evidence missing');
 const seen=new Set();for(const s of calendar.sessions){assert(/^\d{4}-\d{2}-\d{2}$/.test(s.date));const midnight=Date.parse(s.date+'T00:00:00Z')/1000;assert.equal(s.epochDay,midnight/86400);assert(!seen.has(s.epochDay));seen.add(s.epochDay);assert(s.opensAtSecond>=0&&s.opensAtSecond<s.closesAtSecond&&s.closesAtSecond<=86400);}
 assert(calendar.sessions.length>0&&calendar.sessions.length<=370);
}
function activationIssues(snapshot,calendar,now) {
 const issues=[];const session=calendar.sessions.find(s=>BigInt(s.epochDay)===now/DAY),second=now%DAY;
 if(!session||second<BigInt(session.opensAtSecond)||second>=BigInt(session.closesAtSecond))issues.push('Reviewed regular US equity session is closed');
 if(snapshot.sequencer[1]!==0n||now-snapshot.sequencer[2]<=3600n)issues.push('Source sequencer down or recovery grace period active');
 for(const a of snapshot.assets){const limit=a.isEquity===false||a.symbol==='USDC'?86400n:3600n;if(a.oraclePaused)issues.push(`${a.symbol} source oracle paused`);if(a.round[3]===0n||a.round[3]>now||now-a.round[3]>limit)issues.push(`${a.symbol} source price outside reviewed freshness window`);}
 return issues;
}

export async function main() {
 const args=new Set(process.argv.slice(2));assert([...args].every(a=>['--prepare','--broadcast','--help'].includes(a)),'Unknown argument');
 if(args.has('--help')){console.log('Usage: node scripts/deploy-base-sepolia.mjs [--prepare|--broadcast]. Default prepares only; no signing or broadcasting. See contracts/config/BASE_SEPOLIA_DEPLOYMENT_CHECKLIST.md.');return;}
 assert(!(args.has('--prepare')&&args.has('--broadcast')),'Choose prepare or broadcast');const broadcast=args.has('--broadcast');
 const release=broadcast?acquireDeploymentLock(resolve(ROOT,'contracts/.base-sepolia-deployment.lock')):()=>{};
 process.once('exit',release);
 if(broadcast)process.once('SIGINT',()=>{release();process.exit(130);});
 const env=loadEnv();
 assert(/^0x[0-9a-fA-F]{64}$/.test(env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY??''),'Invalid dedicated deployer key format');
 const account=privateKeyToAccount(env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY);
 const expected=getAddress(env.BASE_SEPOLIA_EXPECTED_DEPLOYER??'0xA437345Be29EC6802024A8e090E34b621b92E5E2');assert(sameAddress(account.address,expected),'Dedicated deployer address mismatch');
 const client=createPublicClient({chain:baseSepolia,transport:http(env.BASE_SEPOLIA_RPC_URL,{retryCount:2,timeout:20000})});
 const source=createPublicClient({chain:base,transport:http(env.BASE_MAINNET_RPC_URL,{retryCount:2,timeout:20000})});
 currentStage='RPC chain checks';
 assert.equal(await client.getChainId(),CHAIN_ID,'Destination must be Base Sepolia 84532');assert.equal(await source.getChainId(),SOURCE_CHAIN_ID,'Source must be Base mainnet 8453');
 // Source-module import is shared with the read-only market-data service; it enforces same-block provenance.
 const {readSourceSnapshot,STOCKS,USDC}=await import('../services/base-market-data.mjs');
 assert.deepEqual(STOCKS.map(s=>s.symbol).sort(),['AAPLc','GOOGLc','METAc','NVDAc']);
 const calendar=JSON.parse(readFileSync(resolve(ROOT,'contracts/config/base-us-equity-sessions-2026.json')));validateCalendar(calendar);
 execFileSync(process.execPath,[resolve(ROOT,'scripts/verify-base-modules.mjs')],{cwd:ROOT,stdio:'inherit'});
 const modules=JSON.parse(readFileSync(resolve(ROOT,'contracts/config/base-modules.json')));
 const manifestPath=resolve(ROOT,'contracts/deployments/base-sepolia-alpha.json');
 const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath)):{schemaVersion:1,chainId:CHAIN_ID,sourceChainId:SOURCE_CHAIN_ID,deployer:account.address,status:'preparing',contracts:{},transactions:{},assets:[],pools:[]};
 assert.equal(manifest.chainId,CHAIN_ID);assert(sameAddress(manifest.deployer,account.address));
 if(manifest.status==='complete'){console.log('The deployment manifest is already complete; no transactions were signed or broadcast.');return;}
 const scriptHash=sha(readFileSync(fileURLToPath(import.meta.url),'utf8'));
 const recipeHash=sha({scriptHash,modules,calendar,STOCKS,USDC,governanceDelay:172800,openingMaxAge:3600,priceMaxAge:86400});
 if(manifest.recipeHash)assert.equal(manifest.recipeHash,recipeHash,'Deployment recipe changed; review before reusing manifest');manifest.recipeHash=recipeHash;manifest.scriptHash=scriptHash;manifest.calendar=calendar;
 const run=new SequentialDeployment({client,account,broadcast,manifestPath,manifest,nonce:await client.getTransactionCount({address:account.address,blockTag:'pending'}),maxFeePerGas:BigInt(env.BASE_SEPOLIA_MAX_FEE_PER_GAS_WEI??'1000000000'),spendLimit:parseEther(env.BASE_SEPOLIA_MAX_TOTAL_FEE_ETH??'0.02')});
 currentStage='initial mainnet source snapshot';
 let snapshot=await readSourceSnapshot(source);manifest.sourceSnapshot=snapshot;run.save();
 const timelock=await run.deploy('Timelock','YSTimelockController',[172800n,[],[],account.address]);
 const governanceToken=await run.deploy('YSToken','YSToken',[account.address]);
 const governor=await run.deploy('Governor','YSGovernor',[governanceToken,timelock,account.address]);
 for(const role of ['PROPOSER_ROLE','EXECUTOR_ROLE','CANCELLER_ROLE'])await run.write(`timelock:grant:${role}`,timelock,'YSTimelockController','grantRole',[keccak256(toHex(role)),governor]);
 await run.write('timelock:renounce-bootstrap-admin',timelock,'YSTimelockController','renounceRole',[zeroHash,account.address]);
 for(const role of [zeroHash,...['PROPOSER_ROLE','EXECUTOR_ROLE','CANCELLER_ROLE'].map(r=>keccak256(toHex(r)))]) {
  await run.expect(timelock,'YSTimelockController','getRoleMemberCount',[role],1n);
  await run.expect(timelock,'YSTimelockController','getRoleMember',[role,0n],role===zeroHash?timelock:governor);
 }
 const routers={};
 for(const [original,config] of Object.entries(modules)) {const addresses=[];for(const group of Object.values(config.modules))addresses.push(await run.deploy(group.contract));routers[original]=await run.deploy(config.router,config.router,addresses);}
 const factory=await run.deploy('Factory','ERC1967Proxy',[routers.SplitRiskPoolFactory,encodeFunctionData({abi:artifact('SplitRiskPoolFactory').abi,functionName:'initialize',args:[account.address,timelock,routers.SplitRiskPool]})]);
 const relay=await run.deploy('BaseSepoliaStockRegistry','BaseSepoliaStockRegistry',[account.address,account.address]);
 const sessionGate=await run.deploy('USMarketSessionGate','USMarketSessionGate',[account.address,account.address]);
 await run.write('calendar:reviewed-2026',sessionGate,'USMarketSessionGate','setDailySessions',[calendar.sessions.map(s=>BigInt(s.epochDay)),calendar.sessions.map(s=>s.opensAtSecond),calendar.sessions.map(s=>s.closesAtSecond)]);
 const inner=await run.deploy('ChainlinkOracleFeed','ChainlinkOracleFeed',[86400n]);
 const wrapper=await run.deploy('CoinbaseStockOracleFeed','CoinbaseStockOracleFeed',[inner,sessionGate,relay]);
 const composite=await run.deploy('CompositeOracle');
 const erc4626=await run.deploy('ERC4626OracleFeed','ERC4626OracleFeed',[inner]);
 const faucet=await run.deploy('Faucet','ConfigurableTokenFaucet',[account.address]);
 const assets=[];
 for(const sourceAsset of [...STOCKS,USDC]) {
  const equity=sourceAsset.symbol!=='USDC',decimals=equity?8:6,symbol=equity?`t${sourceAsset.symbol}`:'TestUSDC';
  const name=`Test ${sourceAsset.name} (Base Sepolia)`;
  const token=await run.deploy(`Token:${sourceAsset.symbol}`,'MockERC20Decimals',[name,symbol,decimals]);
  await run.write(`relay:register:${sourceAsset.symbol}`,relay,'BaseSepoliaStockRegistry','registerToken',[token,sourceAsset.token,sourceAsset.feed]);
  const aggregator=await run.deploy(`Aggregator:${sourceAsset.symbol}`,'BaseSepoliaStockAggregator',[relay,token]);
  assets.push({symbol,sourceSymbol:sourceAsset.symbol,name,sourceName:sourceAsset.name,testToken:token,sourceToken:sourceAsset.token,sourceFeed:sourceAsset.feed,aggregator,decimals,isEquity:equity});
 }
 manifest.assets=assets;run.save();
 async function refreshObservations() {
  if(broadcast){currentStage='refresh mainnet source snapshot';snapshot=await readSourceSnapshot(source);}manifest.sourceSnapshot=snapshot;run.save();
  for(const asset of assets) {const observation=snapshot.assets.find(a=>sameAddress(a.token,asset.sourceToken));assert(observation,`Missing source observation ${asset.symbol}`);
   await run.write(`relay:observe:${snapshot.blockNumber}:${asset.symbol}`,relay,'BaseSepoliaStockRegistry','submitObservation',[asset.testToken,observation.observation]);}
 }
 await refreshObservations();
 await run.write('chainlink:source-sequencer',inner,'ChainlinkOracleFeed','setSequencerUptimeFeed',[relay]);
 await run.write('chainlink:require-source-sequencer',inner,'ChainlinkOracleFeed','setSequencerUptimeFeedRequired',[true]);
 await run.write('erc4626:source-sequencer',erc4626,'ERC4626OracleFeed','setSequencerUptimeFeed',[relay]);
 await run.write('erc4626:require-source-sequencer',erc4626,'ERC4626OracleFeed','setSequencerUptimeFeedRequired',[true]);
 for(const asset of assets) {
  await run.write(`chainlink:feed:${asset.symbol}`,inner,'ChainlinkOracleFeed','setTokenFeed',[asset.testToken,asset.aggregator]);
  if(asset.isEquity){await run.write(`chainlink:opening-freshness:${asset.symbol}`,inner,'ChainlinkOracleFeed','setProtectionOpeningMaxPriceAgeForToken',[asset.testToken,3600n]);await run.write(`wrapper:configure:${asset.symbol}`,wrapper,'CoinbaseStockOracleFeed','setTokenConfigured',[asset.testToken,true]);}
 }
 await run.write('composite:pin-stock-wrapper',composite,'CompositeOracle','setRobinhoodStockOracleFeed',[wrapper]);
 await run.write('composite:factory-ownership',composite,'CompositeOracle','transferOwnership',[factory]);
 await run.write('factory:composite',factory,'SplitRiskPoolFactory','setCompositeOracle',[composite]);
 await run.write('factory:fee-recipient',factory,'SplitRiskPoolFactory','setDefaultProtocolFeeRecipient',[timelock]);
 await run.write('erc4626:factory-ownership',erc4626,'ERC4626OracleFeed','transferOwnership',[factory]);
 await run.write('factory:erc4626',factory,'SplitRiskPoolFactory','setManagedERC4626OracleFeed',[erc4626]);
 for(const asset of assets)await run.write(`factory:whitelist:${asset.symbol}`,factory,'SplitRiskPoolFactory','addTokenInitial',[asset.testToken,asset.name,asset.symbol,asset.isEquity?wrapper:inner,zeroAddress,10000n,true]);
 const usdc=assets.find(a=>!a.isEquity);
 await run.write('factory:strict-usdc',factory,'SplitRiskPoolFactory','setTokenRequiresStrictProtectedPrice',[usdc.testToken,true]);
 // Close every owner bootstrap path before making free test tokens publicly available.
 await run.write('factory:finalize-bootstrap',factory,'SplitRiskPoolFactory','finalizeBootstrap');
 for(const [name,address,type] of [['factory',factory,'SplitRiskPoolFactory'],['chainlink',inner,'ChainlinkOracleFeed'],['wrapper',wrapper,'CoinbaseStockOracleFeed'],['calendar',sessionGate,'USMarketSessionGate'],['relay',relay,'BaseSepoliaStockRegistry'],['faucet',faucet,'ConfigurableTokenFaucet'],...assets.map(a=>[`token:${a.symbol}`,a.testToken,'MockERC20Decimals'])]) {
  // Faucet configuration remains below; transferring it after configuration avoids a bootstrap dead end.
  if(name==='faucet')continue;
  await run.write(`ownership:${name}`,address,type,'transferOwnership',[timelock]);
 }
 await run.expect(factory,'SplitRiskPoolFactory','bootstrapModeEnabled',[],false);
 await run.expect(factory,'SplitRiskPoolFactory','owner',[],timelock);
 await run.expect(composite,'CompositeOracle','authorizedCallerCount',[],0n);
 await run.expect(factory,'SplitRiskPoolFactory','splitRiskPoolImplementation',[],routers.SplitRiskPool);
 await refreshObservations();
 const now=broadcast?(await client.getBlock()).timestamp:BigInt(Math.floor(Date.now()/1000));
 const blockers=activationIssues(snapshot,calendar,now);
 if(broadcast&&blockers.length){manifest.status='awaiting-live-session';manifest.activationBlockers=blockers;run.save();console.log(`Infrastructure deployed; pool activation remains blocked: ${blockers.join('; ')}. Resume the same command during a live, fresh session.`);return;}
 if(!broadcast)manifest.activationBlockers=blockers;
 for(const asset of assets.filter(a=>a.isEquity)) {
  await refreshObservations();
  if(broadcast){assert.equal(await run.read(wrapper,'CoinbaseStockOracleFeed','isProtectionOpeningAllowed',[asset.testToken]),true,`${asset.symbol}: protection opening currently blocked`);await run.read(composite,'CompositeOracle','getPrice',[asset.testToken]);await run.read(composite,'CompositeOracle','getPriceWithStrictCircuitBreaker',[usdc.testToken]);}
  const bond=1000n*10n**6n; // 2x the unchanged $500 creation-bond floor; valueless TestUSDC only.
  await run.write(`approve:factory:${asset.symbol}`,usdc.testToken,'MockERC20Decimals','approve',[factory,bond]);
  const receipt=await run.write(`pool:create:${asset.symbol}`,factory,'SplitRiskPoolFactory','createPool',[asset.testToken,asset.symbol,usdc.testToken,usdc.symbol,1000n,100n,15000n,bond]);
  let pool;
  if(broadcast){const logs=parseEventLogs({abi:artifact('SplitRiskPoolFactory').abi,logs:receipt.logs,eventName:'PoolCreated',strict:true}).filter(l=>sameAddress(l.address,factory));assert.equal(logs.length,1);pool=logs[0].args.poolAddress;assert(sameAddress(logs[0].args.shieldedToken,asset.testToken));assert(sameAddress(logs[0].args.backingToken,usdc.testToken));assert(sameAddress(logs[0].args.creator,account.address));}
  else pool=getAddress('0x'+sha(`prepared-pool:${asset.symbol}`).slice(0,40)); // Explicit placeholder; factory CREATE addresses resolve from confirmed events.
  const previous=manifest.pools.find(p=>p.symbol===asset.symbol);if(previous)assert(sameAddress(previous.address,pool));else manifest.pools.push({symbol:asset.symbol,address:pool,shieldedToken:asset.testToken,backingToken:usdc.testToken});run.save();
  await run.write(`approve:backing:${asset.symbol}`,usdc.testToken,'MockERC20Decimals','approve',[pool,50000n*10n**6n]);
  await run.write(`seed:backing:${asset.symbol}`,pool,'SplitRiskPool','depositBackingAsset',[usdc.testToken,50000n*10n**6n,50000n*10n**6n]);
  await run.write(`approve:shield:${asset.symbol}`,asset.testToken,'MockERC20Decimals','approve',[pool,10n*10n**8n]);
  await run.write(`seed:shield:${asset.symbol}`,pool,'SplitRiskPool','depositShieldedAsset',[asset.testToken,10n*10n**8n,10n*10n**8n]);
  await run.expect(pool,'SplitRiskPool','POOL_FACTORY',[],factory);await run.expect(pool,'SplitRiskPool','owner',[],factory);await run.expect(pool,'SplitRiskPool','governanceTimelock',[],timelock);await run.expect(pool,'SplitRiskPool','requiresStrictProtectedBackingPrice',[],true);
 }
 for(const asset of assets)await run.write(`faucet:fund:${asset.symbol}`,asset.testToken,'MockERC20Decimals','transfer',[faucet,(asset.isEquity?100000n:500000n)*10n**BigInt(asset.decimals)]);
 await run.write('faucet:configure',faucet,'ConfigurableTokenFaucet','setTokens',[assets.map(a=>a.testToken),assets.map(a=>(a.isEquity?25n:10000n)*10n**BigInt(a.decimals))]);
 await run.write('ownership:faucet',faucet,'ConfigurableTokenFaucet','transferOwnership',[timelock]);
 if(broadcast){
  const implementation=await client.getStorageAt({address:factory,slot:IMPLEMENTATION_SLOT});assert(sameAddress('0x'+implementation.slice(-40),routers.SplitRiskPoolFactory));
  manifest.status='complete';manifest.activationBlockers=[];manifest.completedAt=new Date().toISOString();run.save();console.log(`Completed Base Sepolia alpha: ${manifest.pools.length} pools. No recurring relay service was enabled by this script.`);
 }else{atomicJson(resolve(ROOT,'contracts/deployments/base-sepolia-plan.json'),{schemaVersion:1,mode:'prepare-only',chainId:CHAIN_ID,deployer:account.address,recipeHash,sourceSnapshot:snapshot,activationBlockers:manifest.activationBlockers,assets,steps:run.plan,note:'No transactions were signed or broadcast. Pool addresses in call steps are placeholders until PoolCreated receipts. Source observations must be reread during execution.'});console.log(`Prepared ${run.plan.length} sequential transactions without signing or broadcasting. Current activation blockers: ${manifest.activationBlockers.join('; ')||'none'}.`);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{let message=error.shortMessage??error.message??'Deployment stopped';message=String(message).replace(/0x[0-9a-fA-F]{64}/g,'<redacted-32-byte-value>').replace(/https?:\/\/[^\s)]+/g,'<rpc>').slice(0,700);console.error(`${currentStage}: ${error.name??'Error'}: ${message}`);process.exitCode=1;});
