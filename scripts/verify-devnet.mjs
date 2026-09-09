/** Verify the app-facing read path against devnet: discover pools, read stats + oracle health. */
import { createSolanaRpc } from "@solana/kit";
import { listAllPools, getPoolStats, getPoolOracleHealth, getFeed } from "@yieldshield/sdk";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function retryingRpc(base) {
  const is429 = (e) => (e?.context?.statusCode ?? e?.statusCode) === 429 || /\b429\b|Too Many Requests/i.test(String(e?.message ?? e));
  return new Proxy(base, {
    get(t, p, r) {
      const o = Reflect.get(t, p, r);
      if (typeof o !== "function") return o;
      return (...a) => {
        const pend = o.apply(t, a);
        if (pend && typeof pend.send === "function") {
          const send = pend.send.bind(pend);
          pend.send = async (...s) => {
            let d = 600;
            for (let i = 0; i < 9; i++) { try { return await send(...s); } catch (e) { if (!is429(e) || i === 8) throw e; await sleep(d); d = Math.min(d * 2, 8000); } }
          };
        }
        return pend;
      };
    },
  });
}

const rpc = retryingRpc(createSolanaRpc(RPC_URL));
console.log(`Reading pools on ${RPC_URL}\n`);
const pools = await listAllPools(rpc);
console.log(`Discovered ${pools.length} pool(s):`);
for (const p of pools) {
  const { shieldedMint, backingMint } = p.data;
  const stats = await getPoolStats(rpc, p.address);
  const health = await getPoolOracleHealth(rpc, shieldedMint, backingMint);
  const sf = await getFeed(rpc, shieldedMint);
  console.log(`\n• ${p.address}`);
  console.log(`  shielded=${shieldedMint} backing=${backingMint}`);
  console.log(`  totalShielded=${stats.totalShieldedTokens} totalProtector=${stats.totalProtectorTokens}`);
  console.log(`  shielded feed: kind=${sf?.data.primary.kind} cachedPrice=${sf?.data.primaryPrice} cachedPublish=${sf?.data.primaryPublishTime}`);
  console.log(`  oracle health (read-model): status=${health.status} paused=${health.paused}  feeds=${JSON.stringify(health.feeds.map((f) => f.status))}`);
}
console.log("\n✅ app read path OK on devnet");
