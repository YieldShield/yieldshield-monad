#!/usr/bin/env node
/** Additive, resumable Base Sepolia crypto/vault extension. Never mutates existing stock contracts. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createPublicClient, http, fallback, encodeFunctionData, parseEventLogs, parseEther, zeroAddress, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { ROOT, SequentialDeployment, atomicJson, acquireDeploymentLock, readCanonicalReceipt } from './deploy-base-sepolia.mjs';
import { demoArtifact, demoEnvironment, DEPLOYER, MIGRATION_RECIPIENT, verifyDemoArtifacts } from './deploy-base-demo.mjs';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const sha=s=>createHash('sha256').update(s).digest('hex');
export const CRYPTO_KIND='base-sepolia-crypto-vault-extension-v1';
export const CRYPTO_PATH=resolve(ROOT,'contracts/deployments/base-sepolia-crypto-v1.json');
export async function verifyCryptoDeployment(client,m,original) {
 assert.equal(await client.getChainId(),84532); assert.equal(m.deploymentKind,CRYPTO_KIND); assert.equal(m.status,'complete');
 assert.equal(m.preservedStockManifestHash,sha(readFileSync(resolve(ROOT,'contracts/deployments/base-sepolia-demo-v1.json'))));
 assert.equal(m.pools.length,9); assert.equal(m.assets.length,9);
 for(const [name,c] of Object.entries(m.contracts)) {
  const code=await client.getCode({address:c.address}); assert(code&&same(keccak256(code),c.runtimeCodehash),`${name}: code changed`);
  const receipt=await readCanonicalReceipt(client,c.txHash,name);assert(same(receipt.contractAddress,c.address));
 }
 const read=(address,artifact,functionName,args=[])=>client.readContract({address,abi:demoArtifact(artifact).abi,functionName,args});
 for(const p of m.pools){
  assert(same(await read(p.address,'SplitRiskPool','POOL_FACTORY'),m.contracts.CryptoFactory.address));
  assert(same(await read(p.address,'SplitRiskPool','SHIELDED_TOKEN'),p.shieldedToken));
  assert(same(await read(p.address,'SplitRiskPool','BACKING_TOKEN'),p.backingToken));
  assert(await read(p.address,'SplitRiskPool','totalProtectorTokens')>0n);
  const cfg=await read(p.address,'SplitRiskPool','poolConfig');assert.equal(cfg[5],60n);assert.equal(cfg[6],120n);
 }
 for(const name of ['CryptoFactory','CryptoFaucet','VaultOracle']) assert(same(await read(m.contracts[name].address,name==='CryptoFactory'?'SplitRiskPoolFactory':m.contracts[name].artifact,'owner'),original.contracts.Timelock.address));
 assert.equal(await read(m.contracts.CryptoFactory.address,'SplitRiskPoolFactory','bootstrapModeEnabled'),false);
 for(const v of m.vaults){
  assert(same(await read(v.address,'AlphaYieldVault','asset'),v.underlying));
  const assets=await read(v.address,'AlphaYieldVault','totalAssets');
  const balance=await read(v.underlying,'BaseSepoliaAlphaToken','balanceOf',[v.address]);assert(balance>=assets);
  assert(await read(m.contracts.VaultOracle.address,'ERC4626OracleFeed','getPrice',[v.address])>0n);
 }
}
export async function main(){
 const broadcast=process.argv.includes('--broadcast');assert(process.argv.slice(2).every(x=>['--broadcast','--prepare'].includes(x)));
 const env=demoEnvironment(),account=privateKeyToAccount(env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY);assert(same(account.address,DEPLOYER));
 const rpcUrls=[...new Set(['https://base-sepolia-rpc.publicnode.com','https://sepolia.base.org',env.BASE_SEPOLIA_RPC_URL].filter(Boolean))];
 const client=createPublicClient({chain:baseSepolia,transport:fallback(rpcUrls.map(url=>http(url,{timeout:15000,retryCount:1})),{retryCount:1})});
 assert.equal(await client.getChainId(),84532);
 const release=broadcast?acquireDeploymentLock(resolve(ROOT,'contracts/.base-sepolia-deployment.lock')):()=>{};
 process.once('exit',release);
 try {
 const oldRaw=readFileSync(resolve(ROOT,'contracts/deployments/base-sepolia-demo-v1.json'));
 const old=JSON.parse(oldRaw);assert.equal(old.status,'complete');
 const m=existsSync(CRYPTO_PATH)?JSON.parse(readFileSync(CRYPTO_PATH,'utf8')):{schemaVersion:1,deploymentKind:CRYPTO_KIND,chainId:84532,deployer:account.address,status:'preparing',preservedStockManifestHash:sha(oldRaw),contracts:{},transactions:{},assets:[],pools:[],vaults:[]};
 assert.equal(m.preservedStockManifestHash,sha(oldRaw));
 if(m.status==='complete'){await verifyCryptoDeployment(client,m,old);console.log('Crypto extension already complete; no new transactions.');return;}
 const recipeHash=sha(readFileSync(fileURLToPath(import.meta.url)));
 if(m.recipeHash)assert.equal(m.recipeHash,recipeHash,'Deployment recipe changed; reconcile before resuming');m.recipeHash=recipeHash;
 const links=await verifyDemoArtifacts(client,old);
 const run=new SequentialDeployment({client,account,broadcast,manifestPath:CRYPTO_PATH,manifest:m,nonce:await client.getTransactionCount({address:account.address,blockTag:'pending'}),maxFeePerGas:100000000n,spendLimit:parseEther('0.006')});run.links=links;
 const oc=n=>old.contracts[n].address;
 const usdc=old.assets.find(a=>a.sourceSymbol==='USDC');

 const crypto=[];
 for(const a of [{sourceSymbol:'WETH',symbol:'tWETH',name:'Wrapped Ether',decimals:18,basePrice:'320000000000'},{sourceSymbol:'cbBTC',symbol:'tcbBTC',name:'Coinbase wrapped Bitcoin',decimals:8,basePrice:'10000000000000'}]){
  const token=await run.deploy(`Token:${a.sourceSymbol}`,'AlphaCryptoToken',[`Test ${a.name}`,a.symbol,a.decimals,10000000n*10n**BigInt(a.decimals),account.address]);
  crypto.push({...a,testToken:token,isEquity:false,category:'crypto'});
 }
 const cryptoOracle=await run.deploy('CryptoOracle','AlphaCryptoScenarioOracle',[usdc.testToken,crypto.map(a=>a.testToken),crypto.map(a=>BigInt(a.basePrice)),7200]);
 const vaultAssets=[];
 for(const [underlying,symbol,name,seed] of [[crypto[0],'vWETH','Test WETH Yield Vault',100000n],[usdc,'vUSDC','Test USDC Yield Vault',500000n]]){
  const token=await run.deploy(`Vault:${symbol}`,'AlphaYieldVault',[underlying.testToken,name,symbol]);
  const amount=seed*10n**BigInt(underlying.decimals);
  await run.write(`vault:approve:${symbol}`,underlying.testToken,'BaseSepoliaAlphaToken','approve',[token,amount]);
  await run.write(`vault:seed:${symbol}`,token,'AlphaYieldVault','deposit',[amount,account.address]);
  await run.write(`vault:dead-shares:${symbol}`,token,'AlphaYieldVault','transfer',['0x000000000000000000000000000000000000dEaD',2000n*10n**BigInt(underlying.decimals)]);
  const yieldAmount=amount/1000n;
  await run.write(`vault:yield-approve:${symbol}`,underlying.testToken,'BaseSepoliaAlphaToken','approve',[token,yieldAmount]);
  await run.write(`vault:fund-yield:${symbol}`,token,'AlphaYieldVault','fundTestYield',[yieldAmount]);
  vaultAssets.push({sourceSymbol:symbol,symbol,name,decimals:underlying.decimals,testToken:token,isEquity:false,category:'vault',underlying:underlying.testToken});
 }
 m.vaults=vaultAssets.map(a=>({address:a.testToken,symbol:a.symbol,underlying:a.underlying,decimals:a.decimals}));
 const vaultOracle=await run.deploy('VaultOracle','ERC4626OracleFeed',[cryptoOracle]);
 // This explicitly synthetic Sepolia fixture has no live-market sequencer feed.
 await run.write('vault:demo-sequencer-policy',vaultOracle,'ERC4626OracleFeed','setSequencerUptimeFeedRequired',[false]);
 for(const v of m.vaults)await run.write(`vault:register:${v.symbol}`,vaultOracle,'ERC4626OracleFeed','registerVault',[v.address,v.underlying]);
 await run.write('vault:oracle-ownership',vaultOracle,'ERC4626OracleFeed','transferOwnership',[oc('Timelock')]);
 const backingFeed=await run.deploy('VaultBackingFeed','AlphaVaultBackingFeed',[vaultOracle,vaultAssets[1].testToken]);
 const initializer=await run.deploy('CryptoInitializer','AlphaCryptoInitializeModule',[oc('BasePoolInitializeModule'),vaultAssets[0].testToken,vaultAssets[1].testToken]);
 const modules=JSON.parse(readFileSync(resolve(ROOT,'contracts/config/base-modules.json'),'utf8'));
 const router=await run.deploy('CryptoPoolRouter','BasePoolRouter',Object.values(modules.SplitRiskPool.modules).map(group=>group.contract==='BasePoolInitializeModule'?initializer:oc(group.contract)));
 const factory=await run.deploy('CryptoFactory','ERC1967Proxy',[oc('BaseFactoryRouter'),encodeFunctionData({abi:demoArtifact('SplitRiskPoolFactory').abi,functionName:'initialize',args:[account.address,oc('Timelock'),router]})]);
 const composite=await run.deploy('CryptoComposite','CompositeOracle');
 await run.write('crypto:composite-owner',composite,'CompositeOracle','transferOwnership',[factory]);
 await run.write('crypto:composite',factory,'SplitRiskPoolFactory','setCompositeOracle',[composite]);
 await run.write('crypto:fee-recipient',factory,'SplitRiskPoolFactory','setDefaultProtocolFeeRecipient',[oc('Timelock')]);
 const newAssets=[...crypto,...vaultAssets];m.assets=[...old.assets,...newAssets];run.save();
 for(const a of [usdc,...newAssets,...old.assets.filter(a=>a.isEquity)])await run.write(`crypto:whitelist:${a.symbol}`,factory,'SplitRiskPoolFactory','addTokenInitial',[a.testToken,a.name,a.symbol,a.isEquity?oc('DemoOracle'):a.symbol==='vUSDC'?backingFeed:a.category==='vault'?vaultOracle:cryptoOracle,zeroAddress,10000n,true]);
 for(const a of [usdc,vaultAssets[1]])await run.write(`crypto:strict:${a.symbol}`,factory,'SplitRiskPoolFactory','setTokenRequiresStrictProtectedPrice',[a.testToken,true]);
 await run.write('crypto:finalize',factory,'SplitRiskPoolFactory','finalizeBootstrap');
 await run.write('crypto:factory-ownership',factory,'SplitRiskPoolFactory','transferOwnership',[oc('Timelock')]);
 for(const [s,b] of [[crypto[0],usdc],[crypto[1],usdc],[vaultAssets[0],usdc],[crypto[0],vaultAssets[1]],[crypto[1],vaultAssets[1]],...old.assets.filter(a=>a.isEquity).map(a=>[a,vaultAssets[1]])]){
  const id=`${s.symbol}:${b.symbol}`,bond=1000n*10n**BigInt(b.decimals),seed=50000n*10n**BigInt(b.decimals);
  await run.write(`crypto:bond:${id}`,b.testToken,b.category==='vault'?'AlphaYieldVault':'BaseSepoliaAlphaToken','approve',[factory,bond]);
  const receipt=await run.write(`crypto:pool:${id}`,factory,'SplitRiskPoolFactory','createPool',[s.testToken,s.symbol,b.testToken,b.symbol,1000n,100n,15000n,bond]);
  let address;
  if(broadcast){const logs=parseEventLogs({abi:demoArtifact('SplitRiskPoolFactory').abi,logs:receipt.logs,eventName:'PoolCreated',strict:true}).filter(l=>same(l.address,factory));assert.equal(logs.length,1);address=logs[0].args.poolAddress;}
  else address='0x'+sha(id).slice(0,40);
  const existing=m.pools.find(p=>p.id===id);if(existing)assert(same(existing.address,address));else m.pools.push({id,symbol:s.symbol,backingSymbol:b.symbol,address,shieldedToken:s.testToken,backingToken:b.testToken});run.save();
  await run.write(`crypto:backing-approve:${id}`,b.testToken,b.category==='vault'?'AlphaYieldVault':'BaseSepoliaAlphaToken','approve',[address,seed]);
  await run.write(`crypto:backing-seed:${id}`,address,'SplitRiskPool','depositBackingAsset',[b.testToken,seed,seed]);
 }
 const traded=m.assets.filter(a=>a.symbol!=='TestUSDC');
 const assetOracle=await run.deploy('AssetOracle','AlphaAssetOracle',[usdc.testToken,traded.map(a=>a.testToken),traded.map(a=>a.isEquity?oc('DemoOracle'):a.category==='vault'?vaultOracle:cryptoOracle)]);
 const exchange=await run.deploy('AssetExchange','AlphaAssetExchange',[assetOracle]);
 const faucet=await run.deploy('CryptoFaucet','ConfigurableTokenFaucet',[account.address]);
 for(const a of m.assets){const vault=a.category==='vault',artifact=vault?'AlphaYieldVault':'BaseSepoliaAlphaToken',scale=10n**BigInt(a.decimals);
  await run.write(`crypto:exchange-fund:${a.symbol}`,a.testToken,artifact,'transfer',[exchange,(a.symbol==='TestUSDC'?250000n:vault?10000n:10000n)*scale]);
  await run.write(`crypto:faucet-fund:${a.symbol}`,a.testToken,artifact,'transfer',[faucet,(a.symbol==='TestUSDC'?300000n:vault?10000n:10000n)*scale]);
 }
 const drip=a=>a.symbol==='TestUSDC'?10000n*10n**6n:a.symbol==='tcbBTC'?5n*10n**6n:a.symbol==='vUSDC'?1000n*10n**6n:a.isEquity?25n*10n**8n:5n*10n**BigInt(a.decimals);
 await run.write('crypto:faucet-configure',faucet,'ConfigurableTokenFaucet','setTokens',[m.assets.map(a=>a.testToken),m.assets.map(drip)]);
 await run.write('crypto:faucet-owner',faucet,'ConfigurableTokenFaucet','transferOwnership',[oc('Timelock')]);
 await run.write('crypto:starter-basket',faucet,'ConfigurableTokenFaucet','dripAll',[MIGRATION_RECIPIENT]);
 if(broadcast){m.status='complete';m.completedAt=new Date().toISOString();run.save();await verifyCryptoDeployment(client,m,old);console.log(`Verified crypto extension: ${m.pools.length} added pools; 2 backed vaults; existing stocks unchanged.`);}
 else atomicJson(resolve(ROOT,'contracts/deployments/base-sepolia-crypto-plan.json'),{chainId:84532,prepareOnly:true,steps:run.plan,assets:m.assets,pools:m.pools});
 }finally{release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(String(e.shortMessage||e.message||'Deployment stopped').replace(/0x[0-9a-fA-F]{64}/g,'<hash>').replace(/https?:\/\/[^\s)]+/g,'<rpc>'));process.exitCode=1;});
