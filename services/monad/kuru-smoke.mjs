import { encodeFunctionData, keccak256 } from "viem";
import {
  KURU,
  kuruAccountAbi,
  kuruTokenAbi,
  kuruFaucetAbi,
  verifyKuruTarget,
  readKuruIdentity,
  readKuruAccount,
  quoteKuruBuy,
  buildKuruSwapRequest,
  confirmedKuruSwap,
} from "./kuru-contracts.mjs";

/** Operator-invoked testnet exercise. This module never reads a key or broadcasts on import.
 * The caller MUST durably journal each intent before broadcast and each receipt afterwards.
 * Reconcile an incomplete journal by its expected hash; never blindly rerun it.
 */
export async function runKuruFundingSmoke({ client, wallet, account, onIntent, onReceipt, maxGasCost = 10n ** 18n }) {
  if (typeof onIntent !== "function" || typeof onReceipt !== "function")
    throw new Error("Durable intent and receipt callbacks are required.");
  if (maxGasCost <= 0n || maxGasCost > 10n ** 18n) throw new Error("Smoke gas budget must be at most 1 testnet MON.");
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const signers = await wallet.getAddresses();
  if (!same(signers[0] || "", account) || (await wallet.getChainId()) !== 10143)
    throw new Error("Smoke wallet identity mismatch.");
  let reservedGasCost = 0n;
  const transactions = [];
  async function send(step, request) {
    await verifyKuruTarget(client, request.address);
    await client.simulateContract({ ...request, account });
    const data = encodeFunctionData(request);
    const estimated = await client.estimateGas({ account, to: request.address, data });
    const gas = (estimated * 150n + 99n) / 100n + 100000n;
    if (gas > 16000000n) throw new Error("Smoke gas limit exceeds app policy.");
    const fees = await client.estimateFeesPerGas();
    const cost = gas * fees.maxFeePerGas;
    if (reservedGasCost + cost > maxGasCost) throw new Error("Smoke gas budget exhausted before signing.");
    if ((await client.getBalance({ address: account })) < cost + 5n * 10n ** 16n)
      throw new Error("Insufficient testnet gas reserve.");
    const prepared = await wallet.prepareTransactionRequest({
      account: wallet.account || account,
      to: request.address,
      data,
      gas,
      ...fees,
      value: 0n,
      type: "eip1559",
    });
    if (prepared.chainId !== 10143) throw new Error("Refusing a non-testnet transaction.");
    const serializedTransaction = await wallet.signTransaction(prepared);
    const expectedHash = keccak256(serializedTransaction);
    const intent = {
      step,
      chainId: 10143,
      account,
      to: request.address,
      functionName: request.functionName,
      args: request.args || [],
      expectedHash,
      nonce: prepared.nonce,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maximumGasCost: cost,
    };
    await onIntent(intent);
    reservedGasCost += cost;
    const returnedHash = await client.sendRawTransaction({ serializedTransaction });
    if (returnedHash !== expectedHash) throw new Error(`Unexpected broadcast hash; reconcile ${expectedHash}.`);
    const receipt = await client.waitForTransactionReceipt({
      hash: expectedHash,
      confirmations: 2,
      timeout: 120000,
      checkReplacement: false,
    });
    await onReceipt({ ...intent, status: receipt.status, blockNumber: receipt.blockNumber });
    if (receipt.status !== "success")
      throw new Error(`${step} reverted. Reconcile the saved journal before continuing.`);
    transactions.push({ step, hash: expectedHash, blockNumber: receipt.blockNumber, maximumGasCost: cost });
    return { receipt, maximumGasCost: cost };
  }
  const identity = await readKuruIdentity(client);
  const initial = await readKuruAccount(client, account);
  let current = initial;
  const amountIn = KURU.minInput;
  if (current.usdc < amountIn && current.walletUsdc < amountIn - current.usdc) {
    await send("claim-kuru-test-bundle", { address: KURU.faucet, abi: kuruFaucetAbi, functionName: "claim" });
    current = await readKuruAccount(client, account);
    if (current.walletUsdc < amountIn - current.usdc) throw new Error("Faucet did not supply the required Kuru USDC.");
  }
  if (current.usdc < amountIn) {
    const missing = amountIn - current.usdc;
    const allowance = await client.readContract({
      address: KURU.usdc,
      abi: kuruTokenAbi,
      functionName: "allowance",
      args: [account, KURU.account],
    });
    if (allowance < missing)
      await send("approve-exact-kuru-usdc", {
        address: KURU.usdc,
        abi: kuruTokenAbi,
        functionName: "approve",
        args: [KURU.account, missing],
      });
    await send("deposit-kuru-usdc", {
      address: KURU.account,
      abi: kuruAccountAbi,
      functionName: "deposit",
      args: [KURU.usdc, missing],
    });
    const deposited = await readKuruAccount(client, account);
    if (deposited.usdc !== current.usdc + missing || deposited.walletUsdc !== current.walletUsdc - missing)
      throw new Error("Kuru deposit balance reconciliation failed.");
  }
  const quote = await quoteKuruBuy(client, { account, amountIn });
  const beforeSwap = await readKuruAccount(client, account);
  const { receipt } = await send("buy-mon-on-kuru", buildKuruSwapRequest(quote, account, beforeSwap.userId));
  const fill = confirmedKuruSwap(receipt, quote, account);
  const afterSwap = await readKuruAccount(client, account);
  if (afterSwap.usdc !== beforeSwap.usdc - fill.amountInUsed || afterSwap.mon !== beforeSwap.mon + fill.amountOut)
    throw new Error("Kuru fill balance reconciliation failed.");
  const walletMonBefore = await client.getBalance({ address: account });
  const withdrawal = await send("withdraw-bought-mon", {
    address: KURU.account,
    abi: kuruAccountAbi,
    functionName: "withdraw",
    args: [KURU.native, fill.amountOut],
  });
  const [final, walletMonAfter] = await Promise.all([
    readKuruAccount(client, account),
    client.getBalance({ address: account }),
  ]);
  if (final.mon !== beforeSwap.mon || walletMonAfter < walletMonBefore + fill.amountOut - withdrawal.maximumGasCost)
    throw new Error("Native MON withdrawal reconciliation failed.");
  return {
    kind: "internal-testnet-smoke",
    chainId: 10143,
    account,
    identity,
    initial,
    quote,
    fill,
    final,
    walletMonBeforeWithdrawal: walletMonBefore,
    walletMonAfterWithdrawal: walletMonAfter,
    reservedGasCost,
    transactions,
    protectionOpened: false,
  };
}
