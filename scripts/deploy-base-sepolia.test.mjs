import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256 } from 'viem';
import { SequentialDeployment,linkBytecode,assertRuntimeMatches,acquireDeploymentLock } from './deploy-base-sepolia.mjs';
const TEST_KEY='0x'+'11'.repeat(32),account=privateKeyToAccount(TEST_KEY),to='0x0000000000000000000000000000000000000001';
const missing=()=>Object.assign(new Error('missing'),{name:'TransactionReceiptNotFoundError'});
function fixture({broadcast=true,failFirst=false,pending=false}={}) {
 const path=join(mkdtempSync(join(tmpdir(),'ys-base-deploy-test-')),'manifest.json');
 const manifest={chainId:84532,contracts:{},transactions:{}};let nonce=0,receipt,attempts=0;const raws=[];
 const client={
  getTransactionCount:async({blockTag})=>nonce+(pending&&blockTag==='pending'?1:0),
  estimateGas:async()=>21000n,estimateFeesPerGas:async()=>({maxFeePerGas:10n,maxPriorityFeePerGas:1n}),getBalance:async()=>10n**18n,
  getTransactionReceipt:async()=>{if(!receipt)throw missing();return receipt;},
  getTransaction:async()=>{throw new Error('not found');},
  sendRawTransaction:async({serializedTransaction})=>{attempts++;raws.push(serializedTransaction);const saved=JSON.parse(readFileSync(path));assert.equal(saved.transactions.operation.hash,keccak256(serializedTransaction),'intent saved before submission');assert(!readFileSync(path,'utf8').includes(TEST_KEY));assert(!readFileSync(path,'utf8').includes(serializedTransaction));if(failFirst&&attempts===1)throw new Error('uncertain network result');nonce++;receipt={status:'success',transactionHash:keccak256(serializedTransaction),blockHash:'0x'+'22'.repeat(32),blockNumber:1n,gasUsed:21000n,transactionIndex:0,logs:[]};return receipt.transactionHash;},
  waitForTransactionReceipt:async()=>receipt,
  getBlock:async({blockTag})=>({number:blockTag==='latest'?2n:1n,hash:'0x'+'22'.repeat(32),transactions:[receipt?.transactionHash]}),
 };
 const run=new SequentialDeployment({client,account,broadcast,manifestPath:path,manifest,nonce:0,maxFeePerGas:100n,spendLimit:10n**18n});
 return {run,client,path,manifest,raws};
}
test('preparation never signs, sends, or writes a transaction manifest',async()=>{const {run,manifest}=fixture({broadcast:false});run.account={address:account.address,signTransaction:()=>{throw Error('must not sign');}};const result=await run.transaction('operation',{data:'0x6000',kind:'deployment'});assert.match(result.contractAddress,/^0x[0-9a-fA-F]{40}$/);assert.equal(run.plan.length,1);assert.equal(Object.keys(manifest.transactions).length,0);});
test('uncertain broadcast resumes exactly the saved signature/hash and never duplicates a confirmed step',async()=>{const {run,client,path,raws}=fixture({failFirst:true});await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/uncertain/);const stored=JSON.parse(readFileSync(path));assert.equal(stored.transactions.operation.status,'prepared');const resumed=new SequentialDeployment({client,account,broadcast:true,manifestPath:path,manifest:stored,nonce:0,maxFeePerGas:100n,spendLimit:10n**18n});await resumed.transaction('operation',{to,data:'0x1234'});assert.equal(raws.length,2);assert.equal(raws[0],raws[1]);await resumed.transaction('operation',{to,data:'0x1234'});assert.equal(raws.length,2);await assert.rejects(resumed.transaction('operation',{to,data:'0xabcd'}),/Resume intent changed/);});
test('unknown pending account transaction blocks deployment before signing',async()=>{const {run}=fixture({pending:true});run.account={address:account.address,signTransaction:()=>{throw Error('must not sign');}};await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/Unrelated pending transaction/);});
test('library linking requires the exact compiler-specified address and offset',()=>{const bytecode='0x60'+'00'.repeat(20)+'00';const refs={'Lib.sol':{Lib:[{start:1,length:20}]}};assert.equal(linkBytecode(bytecode,refs,{'Lib.sol:Lib':to}),'0x60'+to.slice(2)+'00');assert.throws(()=>linkBytecode(bytecode,refs,{}),/Missing library/);});
test('runtime verification ignores only compiler-declared immutables and detects changed logic',()=>{const a={deployedBytecode:{object:'0x60000060ff',linkReferences:{},immutableReferences:{'1':[{start:1,length:2}]}}};assertRuntimeMatches(a,'0x60123460ff',to,{});assert.throws(()=>assertRuntimeMatches(a,'0x60123461ff',to,{}),/differs/);});
test('runtime verification preserves Solidity library address patching',()=>{const a={deployedBytecode:{object:'0x73'+'00'.repeat(20)+'30146000',linkReferences:{},immutableReferences:{}}};assertRuntimeMatches(a,'0x73'+to.slice(2)+'30146000',to,{});});

test('exclusive deployment lock blocks a second process and releases explicitly',()=>{const path=join(mkdtempSync(join(tmpdir(),'ys-base-lock-test-')),'deployment.lock');const release=acquireDeploymentLock(path);assert.throws(()=>acquireDeploymentLock(path),/EEXIST/);release();const releaseAgain=acquireDeploymentLock(path);releaseAgain();});
test('persisted transaction calldata tampering is rejected even with the old intent digest',async()=>{const {run}=fixture({failFirst:true});await assert.rejects(run.transaction('operation',{to,data:'0x1234'}));run.manifest.transactions.operation.request.data='0xbeef';await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/persisted transaction calldata changed/);});
test('repeated identical preparation step consumes one nonce only',async()=>{const {run}=fixture({broadcast:false});await run.transaction('operation',{to,data:'0x1234'});await run.transaction('operation',{to,data:'0x1234'});assert.equal(run.plan.length,1);assert.equal(run.cursor,1);await assert.rejects(run.transaction('operation',{to,data:'0x9999'}),/conflicting prepared intent/);});

const replacementHash='0x'+'ab'.repeat(32);
for(const replacement of ['cancelled','replaced'])test(`a successful ${replacement} receipt cannot confirm a submitted setup step`,async()=>{
 const {run,client,manifest,path}=fixture();let waits=0;
 client.waitForTransactionReceipt=async options=>{
  waits++;assert.equal(options.checkReplacement,false,'replacement following must be disabled');
  return {status:'success',transactionHash:replacementHash,blockHash:'0x'+'22'.repeat(32),blockNumber:1n,gasUsed:21000n,logs:[]};
 };
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/receipt transaction hash does not match/);
 assert.equal(waits,1);assert.equal(manifest.transactions.operation.status,'submitted');
 assert.equal(JSON.parse(readFileSync(path)).transactions.operation.status,'submitted');
 assert.equal(manifest.transactions.operation.receipt,undefined);
});
for(const status of ['prepared','submitted'])test(`resuming a ${status} step rejects an unrelated existing receipt before resending`,async()=>{
 const {run,client,manifest,raws}=fixture({failFirst:true});
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/uncertain/);
 manifest.transactions.operation.status=status;
 client.getTransactionReceipt=async()=>({status:'success',transactionHash:replacementHash,blockHash:'0x'+'22'.repeat(32)});
 client.waitForTransactionReceipt=async()=>{throw Error('must reject before waiting');};
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/receipt transaction hash does not match/);
 assert.equal(raws.length,1);assert.equal(manifest.transactions.operation.status,status);
});
test('confirmed resume rejects a replacement even when the receipt block hash matches',async()=>{
 const {run,client,raws}=fixture();await run.transaction('operation',{to,data:'0x1234'});
 const original=client.getTransactionReceipt;
 client.getTransactionReceipt=async()=>({...await original(),transactionHash:replacementHash});
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/receipt transaction hash does not match/);
 assert.equal(raws.length,1);
});
for(const broadcast of [false,true])test(`a saved replacement receipt cannot complete ${broadcast?'broadcast':'prepare'} recovery`,async()=>{
 const {run,manifest,raws}=fixture();await run.transaction('operation',{to,data:'0x1234'});
 manifest.transactions.operation.receipt.transactionHash=replacementHash;run.broadcast=broadcast;
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/receipt transaction hash does not match/);
 assert.equal(raws.length,1);
});
test('a matching initial receipt does not excuse a different finality receipt',async()=>{
 const {run,client,manifest}=fixture({failFirst:true});await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/uncertain/);
 client.getTransactionReceipt=async()=>({status:'success',transactionHash:manifest.transactions.operation.hash,blockHash:'0x'+'22'.repeat(32)});
 client.waitForTransactionReceipt=async options=>{assert.equal(options.checkReplacement,false);return {status:'success',transactionHash:replacementHash,blockHash:'0x'+'22'.repeat(32)};};
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/receipt transaction hash does not match/);
 assert.equal(manifest.transactions.operation.status,'prepared');
});

for(const status of ['prepared','submitted'])for(const limit of ['fee','budget','balance'])test(`a ${status} transaction must satisfy the current ${limit} limit before resubmission`,async()=>{
 const {run,client,manifest,raws}=fixture({failFirst:true});
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/uncertain/);
 const entry=manifest.transactions.operation;entry.status=status;
 if(limit==='fee')run.maxFeePerGas=1n;
 if(limit==='budget')run.spendLimit=BigInt(entry.request.gas)*BigInt(entry.request.maxFeePerGas)-1n;
 if(limit==='balance')client.getBalance=async()=>0n;
 run.account={address:account.address,signTransaction:()=>{throw Error('must reject before signing');}};
 const reason={fee:/Transaction fee exceeds configured deployment cap/,budget:/cumulative maximum fee budget exceeded/,balance:/Insufficient test ETH/}[limit];
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),reason);
 assert.equal(raws.length,1);assert.equal(entry.status,status);
});
for(const metadata of ['0',undefined])test(`saved cost metadata ${metadata===undefined?'missing':'reduced to zero'} cannot bypass the resumed budget`,async()=>{
 const {run,manifest,raws}=fixture({failFirst:true});await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/uncertain/);
 manifest.transactions.operation.maximumCost=metadata;run.spendLimit=0n;
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/cumulative maximum fee budget exceeded/);assert.equal(raws.length,1);
});
test('new transactions reserve historical signed request costs even if summary metadata is reduced',async()=>{
 const {run,manifest,raws}=fixture();await run.transaction('operation',{to,data:'0x1234'});
 const original=manifest.transactions.operation;original.maximumCost='0';run.spendLimit=BigInt(original.request.gas)*BigInt(original.request.maxFeePerGas);
 await assert.rejects(run.transaction('next-operation',{to,data:'0xabcd'}),/cumulative maximum fee budget exceeded/);
 assert.equal(raws.length,1);assert.equal(manifest.transactions['next-operation'],undefined);
});
for(const status of ['prepared','submitted','confirmed'])test(`an already mined ${status} transaction can be reconciled after limits are lowered`,async()=>{
 const {run,client,manifest,raws}=fixture();await run.transaction('operation',{to,data:'0x1234'});
 manifest.transactions.operation.status=status;run.maxFeePerGas=0n;run.spendLimit=0n;
 client.getBalance=async()=>{throw Error('reconciliation must not check submission balance');};
 client.sendRawTransaction=async()=>{throw Error('must not resubmit an already mined transaction');};
 const receipt=await run.transaction('operation',{to,data:'0x1234'});
 assert.equal(receipt.transactionHash,manifest.transactions.operation.hash);assert.equal(manifest.transactions.operation.status,'confirmed');assert.equal(raws.length,1);
});

test('a cached zero-hash wait result is replaced by a fresh sealed receipt',async()=>{
 const {run,client,manifest}=fixture();const original=client.waitForTransactionReceipt;
 client.waitForTransactionReceipt=async()=>({...await original(),blockHash:'0x'+'00'.repeat(32)});
 await run.transaction('operation',{to,data:'0x1234'});
 assert.equal(manifest.transactions.operation.receipt.blockHash,'0x'+'22'.repeat(32));
});
test('a fresh unsealed receipt cannot mark a submitted transaction confirmed',async()=>{
 const {run,client,manifest}=fixture();const original=client.getTransactionReceipt;
 client.getTransactionReceipt=async()=>({...await original(),blockHash:'0x'+'00'.repeat(32)});
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/not sealed/);
 assert.equal(manifest.transactions.operation.status,'submitted');assert.equal(manifest.transactions.operation.receipt,undefined);
});
test('a confirmed resume must still belong to the canonical block',async()=>{
 const {run,client,raws}=fixture();await run.transaction('operation',{to,data:'0x1234'});
 client.getBlock=async()=>({number:1n,hash:'0x'+'33'.repeat(32),transactions:[]});
 await assert.rejects(run.transaction('operation',{to,data:'0x1234'}),/canonical block/);assert.equal(raws.length,1);
});
