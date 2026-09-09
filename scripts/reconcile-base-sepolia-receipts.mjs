#!/usr/bin/env node
/** One-off repair of the exact 2026-09-08 preconfirmation receipt incident.
 * Read-only RPC; never loads a private key, signs, or broadcasts. Default checks only.
 * --apply atomically records reviewed canonical receipt hashes and preserves originals.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublicClient,http,keccak256,serializeTransaction,recoverTransactionAddress,zeroHash} from 'viem';
import {ROOT,atomicJson,acquireDeploymentLock,readCanonicalReceipt} from './deploy-base-sepolia.mjs';
import {STOCKS,USDC} from '../services/base-market-data.mjs';
const OLD_MANIFEST='6e8d975fd990d1720bfd62623204357a26f531a07dbf1d581d54447fd24209e6';
const OLD_SCRIPT='574e07d40c48a6df1215113c814324af9969f2a9d74c3b3eea4631714c3e4e26';
const NEW_SCRIPT='a0daa1eddcc95cc20b052e25b034c7ecadaddaf5f65387285085f2cb573f979c';
const DEPLOYER='0xA437345Be29EC6802024A8e090E34b621b92E5E2';
const stringify=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const sha=value=>createHash('sha256').update(typeof value==='string'?value:stringify(value)).digest('hex');
const same=(a,b)=>assert.equal(a.toLowerCase(),b.toLowerCase());
const args=process.argv.slice(2);assert(args.length===0||(args.length===1&&args[0]==='--apply'),'Use no args or --apply');
const apply=args.includes('--apply');
const release=acquireDeploymentLock(ROOT+'/contracts/.base-sepolia-deployment.lock');process.once('exit',release);
const path=ROOT+'/contracts/deployments/base-sepolia-alpha.json';
const original=fs.readFileSync(path,'utf8'),manifest=JSON.parse(original);
// A repeat is a no-op only while the exact previously reconciled state remains intact.
if(manifest.receiptReconciliation?.originalManifestSha256===OLD_MANIFEST){
 const prior=manifest.receiptReconciliation,restored=structuredClone(manifest);delete restored.receiptReconciliation;
 for(const [id,receipt] of Object.entries(prior.originalReceipts))restored.transactions[id].receipt=receipt;
 restored.scriptHash=OLD_SCRIPT;restored.recipeHash=prior.originalRecipeHash;
 assert.equal(sha(stringify(restored)),OLD_MANIFEST,'Reconciled state changed; do not rerun this incident-specific repair');
 assert.equal(manifest.scriptHash,NEW_SCRIPT);console.log('This exact incident was already reconciled. No files or transactions changed.');
}else{
 assert.equal(sha(original),OLD_MANIFEST,'Only the exact reviewed incident manifest may be repaired');
 assert.equal(manifest.status,'awaiting-live-session');assert.equal(manifest.scriptHash,OLD_SCRIPT);assert.equal(manifest.chainId,84532);same(manifest.deployer,DEPLOYER);
 assert.equal(sha(fs.readFileSync(ROOT+'/scripts/deploy-base-sepolia.mjs','utf8')),NEW_SCRIPT,'Receipt hardening source differs from reviewed revision');
 const modules=JSON.parse(fs.readFileSync(ROOT+'/contracts/config/base-modules.json'));
 const calendar=JSON.parse(fs.readFileSync(ROOT+'/contracts/config/base-us-equity-sessions-2026.json'));
 const recipe=scriptHash=>sha({scriptHash,modules,calendar,STOCKS,USDC,governanceDelay:172800,openingMaxAge:3600,priceMaxAge:86400});
 assert.equal(manifest.recipeHash,recipe(OLD_SCRIPT),'Original recipe inputs changed');
 const endpoints=['https://sepolia.base.org','https://base-sepolia-rpc.publicnode.com'];
 const clients=endpoints.map(url=>createPublicClient({transport:http(url,{retryCount:2,timeout:15000})}));
 for(const client of clients){assert.equal(await client.getChainId(),84532);assert.equal(await client.getTransactionCount({address:DEPLOYER,blockTag:'latest'}),99);assert.equal(await client.getTransactionCount({address:DEPLOYER,blockTag:'pending'}),99);}
 const last=Math.max(...Object.values(manifest.transactions).map(t=>Number(t.receipt.blockNumber)));
 const checkpoints=await Promise.all(clients.map(c=>c.getBlock({blockNumber:BigInt(last)})));
 for(const checkpoint of checkpoints){assert.equal(checkpoint.number,BigInt(last));assert(/^0x[0-9a-fA-F]{64}$/.test(checkpoint.hash)&&checkpoint.hash!==zeroHash);}
 same(checkpoints[0].hash,checkpoints[1].hash);
 const updated=structuredClone(manifest),originalReceipts={};let corrected=0;
 for(const [id,saved] of Object.entries(manifest.transactions)){
  assert.equal(saved.status,'confirmed');const request={...saved.request};for(const key of ['gas','maxFeePerGas','maxPriorityFeePerGas','value'])request[key]=BigInt(request[key]);
  assert.equal(request.chainId,84532);assert.equal(request.type,'eip1559');assert.equal(request.value,0n);
  assert.equal(saved.intentHash,sha({chainId:84532,from:DEPLOYER,to:request.to??null,data:request.data,value:'0'}));
  const receipts=[];
  for(const client of clients){
   const receipt=await readCanonicalReceipt(client,saved.hash,id),tx=await client.getTransaction({hash:saved.hash});
   same(tx.hash,saved.hash);same(tx.from,DEPLOYER);same(tx.blockHash,receipt.blockHash);assert.equal(tx.blockNumber,receipt.blockNumber);
   assert(tx.yParity===0||tx.yParity===1);const serialized=serializeTransaction(request,{r:tx.r,s:tx.s,yParity:tx.yParity});
   same(keccak256(serialized),saved.hash);same(await recoverTransactionAddress({serializedTransaction:serialized}),DEPLOYER);
   assert.equal(receipt.blockNumber,BigInt(saved.receipt.blockNumber));assert.equal(receipt.gasUsed,BigInt(saved.receipt.gasUsed));
   if(receipt.blockNumber===BigInt(last))same(receipt.blockHash,checkpoints[0].hash);
   assert.equal(receipt.contractAddress?.toLowerCase()??null,saved.receipt.contractAddress?.toLowerCase()??null);
   if(saved.receipt.blockHash!==zeroHash)same(receipt.blockHash,saved.receipt.blockHash);
   receipts.push(receipt);
  }
  same(receipts[0].blockHash,receipts[1].blockHash);assert.equal(receipts[0].transactionIndex,receipts[1].transactionIndex);
  if(saved.receipt.blockHash===zeroHash){originalReceipts[id]=saved.receipt;updated.transactions[id].receipt.blockHash=receipts[0].blockHash;corrected++;}
 }
 assert.equal(corrected,97,'Incident scope changed');
 // Recheck the latest verified height on both providers after all receipts have been inspected.
 const heads=await Promise.all(clients.map(c=>c.getBlock({blockNumber:BigInt(last)})));
 for(const head of heads){assert.equal(head.number,BigInt(last));same(head.hash,checkpoints[0].hash);}
 updated.scriptHash=NEW_SCRIPT;updated.recipeHash=recipe(NEW_SCRIPT);
 updated.receiptReconciliation={verifiedAt:new Date().toISOString(),originalManifestSha256:OLD_MANIFEST,originalScriptHash:OLD_SCRIPT,originalRecipeHash:manifest.recipeHash,reviewedScriptHash:NEW_SCRIPT,reviewedRecipeHash:updated.recipeHash,correctedZeroBlockHashes:corrected,checkedTransactions:99,checkpointBlockNumber:String(last),checkpointBlockHash:checkpoints[0].hash,providers:endpoints,originalReceipts,reason:'Fresh sealed receipts replace cached zero block hashes. Exact signed intents, canonical block inclusion and two confirmations verified through both providers. No transaction request, nonce, address, source observation, fee policy or deployment operation changed.'};
 // Prove the only mutations are this evidence, two reviewed recipe digests and zero block hashes.
 const restored=structuredClone(updated);delete restored.receiptReconciliation;
 for(const [id,receipt] of Object.entries(originalReceipts))restored.transactions[id].receipt=receipt;
 restored.scriptHash=OLD_SCRIPT;restored.recipeHash=manifest.recipeHash;assert.deepEqual(restored,manifest);
 assert.equal(fs.readFileSync(path,'utf8'),original,'Manifest changed during verification');
 if(apply)atomicJson(path,updated);
 console.log(JSON.stringify({mode:apply?'applied':'checked-only',transactions:99,correctedZeroBlockHashes:corrected,originalManifestSha256:OLD_MANIFEST,newRecipeHash:updated.recipeHash,noBlockchainTransactions:true}));
}
