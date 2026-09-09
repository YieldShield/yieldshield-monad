#!/usr/bin/env node
/** Monad testnet only. Each signed intent is persisted before broadcasting and resumes by exact hash. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPublicClient,http,encodeFunctionData,parseEther,parseEventLogs,zeroAddress,zeroHash,keccak256,toHex,getAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {ROOT,SequentialDeployment,artifact,loadEnv,atomicJson,acquireDeploymentLock} from './monad-deployment-lib.mjs';
const env=loadEnv(),broadcast=process.argv.includes('--broadcast');
assert(process.argv.slice(2).every(x=>['--broadcast','--prepare'].includes(x)),'Unknown option');
const config=JSON.parse(readFileSync(resolve(ROOT,'config/monad.json')));
const account=privateKeyToAccount(env.MONAD_DEPLOYER_PRIVATE_KEY);
assert.equal(account.address.toLowerCase(),'0xa437345be29ec6802024a8e090e34b621b92e5e2','Wrong dedicated testnet signer');
const client=createPublicClient({chain:monadTestnet,transport:http(env.MONAD_RPC_URL||config.rpcUrl,{timeout:20000,retryCount:2}),pollingInterval:1000});
assert.equal(await client.getChainId(),10143,'Refusing non-Monad-testnet endpoint');
const path=resolve(ROOT,'contracts/deployments/monad-testnet.json');
const manifest=existsSync(path)?JSON.parse(readFileSync(path)):{schemaVersion:1,chainId:10143,deploymentKind:'monad-metropolis-testnet-v1',deployer:account.address,contracts:{},transactions:{},pools:[],assets:[],status:'preparing'};
assert.equal(manifest.chainId,10143);assert.equal(manifest.deployer,account.address);
const release=broadcast?acquireDeploymentLock(resolve(ROOT,'contracts/.monad-deployment.lock')):()=>{};process.once('exit',release);
const run=new SequentialDeployment({client,account,broadcast,manifestPath:path,manifest,nonce:await client.getTransactionCount({address:account.address}),maxFeePerGas:200000000000n,spendLimit:parseEther('4.8')});
async function native(id,to,name,fn,args,value){return run.transaction(id,{to,data:encodeFunctionData({abi:artifact(name).abi,functionName:fn,args}),value});}
async function pool(id,asset,backing){
 const prior=manifest.pools.find(p=>p.id===id); const bond=1000n*10n**6n;
 await run.write(`pool:${id}:approve-bond`,backing.address,backing.artifact,'approve',[factory,bond]);
 const receipt=await run.write(`pool:${id}:create`,factory,'SplitRiskPoolFactory','createPool',[asset.address,asset.symbol,backing.address,backing.symbol,1000n,100n,15000n,bond]);
 let address;
 if(broadcast){const events=parseEventLogs({abi:artifact('SplitRiskPoolFactory').abi,logs:receipt.logs,eventName:'PoolCreated',strict:true}).filter(e=>e.address.toLowerCase()===factory.toLowerCase());assert.equal(events.length,1);address=events[0].args.poolAddress;}
 else address=getAddress('0x'+keccak256(toHex(id)).slice(-40));
 if(prior)assert.equal(prior.address.toLowerCase(),address.toLowerCase());
 else manifest.pools.push({id,address,shieldedToken:asset.address,backingToken:backing.address,symbol:asset.symbol,backingSymbol:backing.symbol,environment:asset.kind==='synthetic'?'scenario':'reference',priceKind:asset.kind==='synthetic'?'synthetic':asset.symbol==='shMON'?'redemption-nav':'external-reference',createdTx:receipt.transactionHash});
 run.save();
 await run.write(`pool:${id}:approve-seed`,backing.address,backing.artifact,'approve',[address,50000n*10n**6n]);
 await run.write(`pool:${id}:seed`,address,'SplitRiskPool','depositBackingAsset',[backing.address,50000n*10n**6n,50000n*10n**6n]);
 await run.expect(address,'SplitRiskPool','POOL_FACTORY',[],factory);await run.expect(address,'SplitRiskPool','requiresStrictProtectedBackingPrice',[],true);
 if(broadcast){const cfg=await run.read(address,'SplitRiskPool','poolConfig');assert.equal(cfg[5],60n);assert.equal(cfg[6],120n);}
 return address;
}
let factory;
try {
 const usd=await run.deploy('TestUSDC','MonadTestToken',['YieldShield Test USD (no monetary value)','TestUSDC',6,10000000n*10n**6n,account.address]);
 const lab=await run.deploy('ScenarioMON','MonadTestToken',['YieldShield Scenario MON (synthetic)','sMON-demo',18,10000000n*10n**18n,account.address]);
 const wmon=await run.deploy('WMON','MonadWrappedNative');
 const vault=await run.deploy('TestUSDVault','MonadYieldVault',[usd,'YieldShield Test USD Vault','vTestUSDC']);
 await run.write('vault:approve',usd,'MonadTestToken','approve',[vault,500000n*10n**6n]);
 await run.write('vault:seed',vault,'MonadYieldVault','depositWithMin',[500000n*10n**6n,500000n*10n**6n,account.address]);
 await run.write('vault:burn-seed',vault,'MonadYieldVault','transfer',['0x000000000000000000000000000000000000dEaD',2000n*10n**6n]);
 const scenario=await run.deploy('ScenarioOracle','MonadScenarioOracle',[usd,[lab],[100n*10n**8n],480]);
 const nav=await run.deploy('VaultNAV','ERC4626OracleFeed',[scenario]);
 await run.write('nav:l1',nav,'ERC4626OracleFeed','setSequencerUptimeFeedRequired',[false]);
 await run.write('nav:register',nav,'ERC4626OracleFeed','registerVault',[vault,usd]);
 const backingFeed=await run.deploy('VaultBackingFeed','MonadVaultBackingFeed',[nav,vault]);
 const reference=await run.deploy('ReferenceFeed','MonadReferenceFeed',[config.pyth.address,config.pyth.monUsdFeedId,wmon,config.externalTokens.shMON,usd]);
 const staking=await run.deploy('StakingRouter','MonadStakingRouter',[config.externalTokens.shMON]);
 const exchangeOracle=await run.deploy('ScenarioExchangeOracle','MonadAssetOracle',[usd,[lab,vault],[scenario,nav]]);
 const exchange=await run.deploy('ScenarioExchange','MonadAssetExchange',[exchangeOracle]);
 const faucet=await run.deploy('Faucet','ConfigurableTokenFaucet',[account.address]);
 // Preserve upstream governance checks: bootstrap is finalized; no production administrator shortcut.
 const timelock=await run.deploy('Timelock','YSTimelockController',[172800n,[],[],account.address]);
 const governanceToken=await run.deploy('YSToken','YSToken',[account.address]);
 const governor=await run.deploy('Governor','YSGovernor',[governanceToken,timelock,account.address]);
 for(const role of ['PROPOSER_ROLE','EXECUTOR_ROLE','CANCELLER_ROLE'])await run.write(`timelock:${role}`,timelock,'YSTimelockController','grantRole',[keccak256(toHex(role)),governor]);
 await run.write('timelock:finalize',timelock,'YSTimelockController','renounceRole',[zeroHash,account.address]);
 const modules=JSON.parse(readFileSync(resolve(ROOT,'contracts/config/base-modules.json')));
 const routers={};
 for(const [name,config]of Object.entries(modules)){
  const targets=[];
  for(const group of Object.values(config.modules)){
   let target=await run.deploy(group.contract);
   if(group.contract==='BasePoolInitializeModule')target=await run.deploy('MonadPoolInitializeModule','MonadPoolInitializeModule',[target,wmon,configExternalShMon(),lab,usd,vault]);
   targets.push(target);
  }
  routers[name]=await run.deploy(config.router,config.router,targets);
 }
 function configExternalShMon(){return config.externalTokens.shMON;}
 factory=await run.deploy('Factory','ERC1967Proxy',[routers.SplitRiskPoolFactory,encodeFunctionData({abi:artifact('SplitRiskPoolFactory').abi,functionName:'initialize',args:[account.address,timelock,routers.SplitRiskPool]})]);
 const composite=await run.deploy('CompositeOracle','CompositeOracle');
 await run.write('composite:ownership',composite,'CompositeOracle','transferOwnership',[factory]);
 await run.write('factory:oracle',factory,'SplitRiskPoolFactory','setCompositeOracle',[composite]);
 await run.write('factory:fees',factory,'SplitRiskPoolFactory','setDefaultProtocolFeeRecipient',[timelock]);
 // A distinct reference factory is initialized only when authenticated Pyth updates are available.
 // The scenario factory contains only synthetic assets and cannot silently substitute them for WMON/shMON.
 const assets=[{id:'test-usd',address:usd,symbol:'TestUSDC',name:'Test USD',decimals:6,kind:'synthetic-unit',feed:scenario,artifact:'MonadTestToken'},
 {id:'scenario-mon',address:lab,symbol:'sMON-demo',name:'Scenario MON',decimals:18,kind:'synthetic',feed:scenario,artifact:'MonadTestToken'},
 {id:'test-usd-vault',address:vault,symbol:'vTestUSDC',name:'Test USD Vault',decimals:6,kind:'test-vault-nav',feed:backingFeed,artifact:'MonadYieldVault'}];
 manifest.assets=assets.concat([{id:'wmon',address:wmon,symbol:'WMON',name:'Wrapped testnet MON',decimals:18,kind:'external-reference',feed:reference,artifact:'MonadWrappedNative'}, {id:'shmon',address:config.externalTokens.shMON,symbol:'shMON',name:'Staked testnet MON',decimals:18,kind:'redemption-nav',feed:reference,external:true}]);run.save();
 for(const a of assets)await run.write(`factory:whitelist:${a.id}`,factory,'SplitRiskPoolFactory','addTokenInitial',[a.address,a.name,a.symbol,a.feed,zeroAddress,10000n,true]);
 for(const a of [assets[0],assets[2]])await run.write(`factory:strict:${a.id}`,factory,'SplitRiskPoolFactory','setTokenRequiresStrictProtectedPrice',[a.address,true]);
 await run.write('factory:finalize',factory,'SplitRiskPoolFactory','finalizeBootstrap');
 await run.write('factory:governance',factory,'SplitRiskPoolFactory','transferOwnership',[timelock]);
 await pool('scenario-mon-usd',assets[1],assets[0]);
 await pool('scenario-mon-vault',assets[1],assets[2]);
 for(const [id,token,name,amount]of [['usd',usd,'MonadTestToken',2000000n*10n**6n],['mon',lab,'MonadTestToken',100000n*10n**18n],['vault',vault,'MonadYieldVault',10000n*10n**6n]])await run.write(`exchange:fund:${id}`,token,name,'transfer',[exchange,amount]);
 for(const [id,token,amount]of [['usd',usd,5000000n*10n**6n],['mon',lab,500000n*10n**18n]])await run.write(`faucet:fund:${id}`,token,'MonadTestToken','transfer',[faucet,amount]);
 await run.write('faucet:config',faucet,'ConfigurableTokenFaucet','setTokens',[[usd,lab],[10000n*10n**6n,25n*10n**18n]]);
 await run.write('faucet:governance',faucet,'ConfigurableTokenFaucet','transferOwnership',[timelock]);
 await run.write('nav:governance',nav,'ERC4626OracleFeed','transferOwnership',[timelock]);
 await native('native:wrap',wmon,'MonadWrappedNative','deposit',[],parseEther('0.01'));
 manifest.status='scenario-complete';manifest.completedAt=new Date().toISOString();manifest.referenceStatus='awaiting-authenticated-pyth-updates';
 manifest.feePolicy={maxFeePerGas:'200000000000',maximumTotalTestMon:'4.8',minimumReserveTestMon:'0.1',gasLimitMultiplier:1.1,mainnetBroadcasts:false};run.save();
 if(!broadcast)atomicJson(resolve(ROOT,'artifacts/local/monad-prepare.json'),{chainId:10143,steps:run.plan,note:'Prepared only. No transactions signed or broadcast.'});
 console.log(`Monad ${broadcast?'deployment':'preparation'} complete: ${run.plan.length||Object.keys(manifest.transactions).length} steps, ${manifest.pools.length} scenario pools.`);
} finally {release();}
