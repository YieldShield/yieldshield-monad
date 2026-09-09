import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCanonicalReceipt} from './deploy-base-sepolia.mjs';

const hash='0x'+'11'.repeat(32),otherHash='0x'+'22'.repeat(32),blockHash='0x'+'33'.repeat(32),zeroHash='0x'+'00'.repeat(32);
const receipt={transactionHash:hash,status:'success',blockHash,blockNumber:10n,transactionIndex:1,contractAddress:null,gasUsed:21000n,logs:[]};
const block={number:10n,hash:blockHash,transactions:[otherHash,hash]};
const head={number:11n,hash:'0x'+'44'.repeat(32),transactions:[]};
function fixture({receipts=[{...receipt},{...receipt}],blocks=[{...block},{...block}],latest={...head}}={}) {
 const calls=[];let receiptIndex=0,blockIndex=0;
 const client={
  getTransactionReceipt:async options=>{calls.push({method:'receipt',...options});assert.equal(options.hash,hash);const result=receipts[receiptIndex++];if(result instanceof Error)throw result;assert(result,'unexpected extra receipt request');return result;},
  getBlock:async options=>{calls.push({method:'block',...options});if(options.blockTag!==undefined){assert.equal(options.blockTag,'latest','confirmation depth must use the sealed latest block');return latest;}assert.equal(options.blockNumber,10n,'canonicality must be checked by receipt height');const result=blocks[blockIndex++];assert(result,'unexpected extra height request');return result;},
 };
 return {client,calls,verify:()=>readCanonicalReceipt(client,hash,'test:canonical-receipt')};
}

test('valid canonical receipt uses a sealed head, rereads receipt/header and returns the fresh receipt',async()=>{
 const finalReceipt={...receipt,logs:[{data:'0xbeef'}]};const {verify,calls}=fixture({receipts:[{...receipt},finalReceipt]});
 assert.strictEqual(await verify(),finalReceipt);
 assert.equal(calls.filter(c=>c.method==='receipt').length,2);
 assert.equal(calls.filter(c=>c.method==='block'&&c.blockNumber===10n).length,2);
 assert(calls.some(c=>c.method==='block'&&c.blockTag==='latest'));
 const lastReceipt=calls.findLastIndex(c=>c.method==='receipt');
 assert(calls.slice(lastReceipt+1).some(c=>c.method==='block'&&c.blockNumber===10n),'canonical header must be checked after the final receipt');
});
test('receipt identity cannot be replaced even if status and confirmation depth are valid',async()=>{
 await assert.rejects(fixture({receipts:[{...receipt,transactionHash:otherHash}]}).verify());
});
test('a reverted transaction never produces a canonical success receipt',async()=>{
 await assert.rejects(fixture({receipts:[{...receipt,status:'reverted'}]}).verify());
});
test('receipt height must be a positive bigint, not pending or loosely coerced',async()=>{
 for(const blockNumber of [null,undefined,0n,-1n,10,'10'])await assert.rejects(fixture({receipts:[{...receipt,blockNumber}]}).verify(),`must reject blockNumber ${String(blockNumber)}`);
});
test('zero, missing and malformed receipt block hashes fail closed',async()=>{
 for(const invalidHash of [zeroHash,null,undefined,'0x1234','0x'+'gg'.repeat(32)])await assert.rejects(fixture({receipts:[{...receipt,blockHash:invalidHash}]}).verify(),`must reject blockHash ${String(invalidHash)}`);
});
test('receipt block must agree with the canonical header at that height',async()=>{
 for(const invalidBlock of [{...block,hash:otherHash},{...block,number:9n}])await assert.rejects(fixture({blocks:[invalidBlock]}).verify());
});
test('receipt transaction must occupy its claimed index in the canonical block',async()=>{
 await assert.rejects(fixture({blocks:[{...block,transactions:[hash,otherHash]}]}).verify());
 await assert.rejects(fixture({receipts:[{...receipt,transactionIndex:2}]}).verify());
});
test('one sealed confirmation or a missing sealed height is insufficient',async()=>{
 for(const number of [10n,9n,null])await assert.rejects(fixture({latest:{...head,number}}).verify());
});
test('a fresh reread returning a zero hash cannot reuse an earlier apparently canonical receipt',async()=>{
 const {verify,calls}=fixture({receipts:[{...receipt},{...receipt,blockHash:zeroHash}]});
 await assert.rejects(verify());assert.equal(calls.filter(c=>c.method==='receipt').length,2);
});
test('final receipt must independently retain successful identity, height and indexed inclusion',async()=>{
 for(const changed of [{transactionHash:otherHash},{status:'reverted'},{blockNumber:11n},{transactionIndex:0}])await assert.rejects(fixture({receipts:[{...receipt},{...receipt,...changed}]}).verify());
});
test('a changed canonical header or transaction position after reread rejects a reorg',async()=>{
 for(const changed of [{...block,hash:otherHash},{...block,transactions:[hash,otherHash]}])await assert.rejects(fixture({blocks:[{...block},changed]}).verify());
});
test('transient receipt lookup failures propagate without retrying or using stale observations',async()=>{
 const failure=Object.assign(new Error('transaction indexing is in progress'),{name:'TransactionReceiptNotFoundError'});
 const {verify,calls}=fixture({receipts:[failure]});await assert.rejects(verify(),error=>error===failure);
 assert.deepEqual(calls,[{method:'receipt',hash}]);
});
