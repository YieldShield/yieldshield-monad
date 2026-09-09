import {
  concatHex,
  recoverAddress,
  toHex,
  toRlp,
  decodeAbiParameters,
  decodeEventLog,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  keccak256,
  parseAbi,
  parseAbiParameters,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
  type RpcTransactionReceipt,
} from "viem";
import type { EvmStep } from "./intents.js";

// MetaMask Delegation Framework v1.3.0, Base Sepolia only. These immutable runtimes
// were checked at the reported transaction block through both public RPCs.
// Sources and the confirmation proof are documented in docs/BASE_WALLET_CONFIRMATION.md.
export const METAMASK_EXECUTION = {
  chainId: 84532,
  manager: "0xdb9b1e94b5b69df7e401ddbede43491141047db3",
  managerCodeHash: "0xa6f025f7bb23ddc0e2546eec56400672c3dfac88c12963bfeb2b5e1121aeee4a",
  implementation: "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b",
  implementationCodeHash: "0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2",
} as const;

export const delegationManagerAbi = parseAbi([
  "struct Caveat { address enforcer; bytes terms; bytes args; }",
  "struct Delegation { address delegate; address delegator; bytes32 authority; Caveat[] caveats; uint256 salt; bytes signature; }",
  "function redeemDelegations(bytes[] permissionContexts, bytes32[] modes, bytes[] executionCallDatas)",
  "event RedeemedDelegation(address indexed rootDelegator, address indexed redeemer, Delegation delegation)",
]);
export const delegationParameters = parseAbiParameters(
  "(address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature)[]",
);
const sameHex = (a: string | null | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
function fail(detail: string): never {
  throw new Error(
    `Relayed transaction confirmation could not be verified: ${detail}. Check wallet activity before retrying.`,
  );
}

/** EIP-7702 code reads are end-of-block reads; exclude later redelegations of this wallet. */
export async function assertStableWalletCodeAtExecution(
  client: PublicClient,
  receipt: RpcTransactionReceipt,
  owner: Address,
  chainId: number,
): Promise<void> {
  const block = await client.request({ method: "eth_getBlockByNumber", params: [receipt.blockNumber, true] });
  const index = Number(BigInt(receipt.transactionIndex));
  const included = block?.transactions[index];
  if (
    !block ||
    block.number === null ||
    !sameHex(block.hash, receipt.blockHash) ||
    BigInt(block.number) !== BigInt(receipt.blockNumber) ||
    !included ||
    typeof included === "string" ||
    !sameHex(included.hash, receipt.transactionHash)
  )
    fail("the full execution block is unavailable");
  for (const later of block.transactions.slice(index + 1)) {
    if (typeof later === "string" || !later.type) fail("later transaction types are unavailable");
    const type = BigInt(later.type);
    if (![0n, 1n, 2n, 3n, 4n, 126n].includes(type)) fail("a later transaction type is unsupported");
    if (type !== 4n) continue;
    if (!("authorizationList" in later) || !Array.isArray(later.authorizationList) || !later.authorizationList.length)
      fail("later wallet authorizations are unavailable");
    for (const authorization of later.authorizationList) {
      const quantity = (value: unknown): bigint => {
        if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value))
          fail("later authorization metadata is malformed");
        return BigInt(value);
      };
      const authChain = quantity(authorization.chainId);
      const nonce = quantity(authorization.nonce);
      const parity = quantity(authorization.yParity);
      const r = quantity(authorization.r),
        s = quantity(authorization.s);
      if (
        !/^0x[0-9a-fA-F]{40}$/.test(authorization.address) ||
        authChain >= 1n << 256n ||
        nonce >= 1n << 64n ||
        parity >= 256n ||
        r >= 1n << 256n ||
        s >= 1n << 256n
      )
        fail("later authorization metadata is malformed");
      const curveOrder = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
      // Invalid individual tuples are skipped by EIP-7702 even in a successful
      // transaction. They cannot redelegate this wallet and must not block its receipt.
      if (
        (authChain !== 0n && authChain !== BigInt(chainId)) ||
        nonce === (1n << 64n) - 1n ||
        parity > 1n ||
        r === 0n ||
        r >= curveOrder ||
        s === 0n ||
        s > curveOrder / 2n
      )
        continue;
      let signer: Address;
      try {
        // Preserve the full uint64 nonce without a lossy JavaScript number conversion.
        const authorizationHash = keccak256(
          concatHex([
            "0x05",
            toRlp([
              authChain === 0n ? "0x" : toHex(authChain),
              authorization.address,
              nonce === 0n ? "0x" : toHex(nonce),
            ]),
          ]),
        );
        signer = await recoverAddress({
          hash: authorizationHash,
          signature: { r: toHex(r, { size: 32 }), s: toHex(s, { size: 32 }), yParity: Number(parity) },
        });
      } catch (error) {
        // Only provably invalid curve points are skipped. A failed crypto-module
        // load or other runtime error must not hide a later wallet redelegation.
        if (
          error instanceof Error &&
          (/^Point is not on curve(?::|$)/.test(error.message) ||
            error.message === "point at infinify" ||
            error.message === "bad point: ZERO")
        )
          continue;
        fail("later wallet authorization recovery is unavailable");
      }
      // Conservatively reject even a redundant or nonce-invalid later authorization by
      // this wallet. Other users' upgrades must not interrupt its confirmations.
      if (sameHex(signer, owner)) fail("the wallet was redelegated later in the execution block");
    }
  }
}

/**
 * Bind a canonical outer transaction to the exact reviewed call. A relayer is not
 * the wallet owner: verify the signed delegation's root and its mandatory single
 * execution, plus the historical manager/account runtimes and redemption logs.
 * Never infer success from token transfers, receipt status, or a nested byte match.
 */
export async function assertReviewedWalletExecution(
  client: PublicClient,
  transaction: { from: Address; to: Address | null; input: Hex },
  receipt: RpcTransactionReceipt,
  owner: Address,
  step: EvmStep,
  chainId: number,
): Promise<void> {
  const data = encodeFunctionData({ abi: step.abi, functionName: step.functionName, args: step.args });
  if (sameHex(transaction.from, owner) && sameHex(transaction.to, step.address) && sameHex(transaction.input, data))
    return;
  if (chainId !== METAMASK_EXECUTION.chainId || !sameHex(transaction.to, METAMASK_EXECUTION.manager))
    throw new Error("Mined transaction differs from the reviewed action. Check wallet activity before retrying.");

  type Delegation = ReturnType<typeof decodeAbiParameters<typeof delegationParameters>>[0][number];
  const expectedRedemptions: { redeemer: Address; delegation: Delegation }[] = [];
  const reviewedExecution = encodePacked(["address", "uint256", "bytes"], [step.address, 0n, data]);
  const managerPrefix = encodePacked(["address", "uint256"], [METAMASK_EXECUTION.manager, 0n]);
  const inspectRedemption = (input: Hex, redeemer: Address, depth: number): void => {
    if (depth >= 4) fail("wallet execution nesting exceeds the supported limit");
    const decoded = decodeFunctionData({ abi: delegationManagerAbi, data: input });
    const [contexts, modes, executions] = decoded.args;
    if (contexts.length !== 1 || modes.length !== 1 || executions.length !== 1 || modes[0] !== zeroHash)
      fail("only one mandatory single-call execution is supported at each wallet layer");
    // Reject trailing or noncanonical wrapper bytes, as for the reviewed leaf call.
    if (
      !sameHex(
        input,
        encodeFunctionData({ abi: delegationManagerAbi, functionName: "redeemDelegations", args: decoded.args }),
      )
    )
      fail("the inner call wrapper differs from canonical execution data");
    const [delegations] = decodeAbiParameters(delegationParameters, contexts[0]!);
    const root = delegations.at(-1);
    const leaf = delegations[0];
    if (
      !root ||
      !leaf ||
      delegations.length > 16 ||
      !sameHex(root.delegator, owner) ||
      root.authority !== `0x${"f".repeat(64)}` ||
      (!sameHex(leaf.delegate, redeemer) && !sameHex(leaf.delegate, "0x0000000000000000000000000000000000000a11"))
    )
      fail("the delegation does not authorize this wallet and relayer");

    const execution = executions[0]!;
    if (!sameHex(execution, reviewedExecution)) {
      // MetaMask can redeem a second signed, self-delegated permission through
      // the same manager. Both pinned default-call layers must propagate failure.
      // Follow only that exact zero-value path; never search nested bytes for a match.
      if (!sameHex(execution.slice(0, managerPrefix.length), managerPrefix))
        fail("the inner call differs from the reviewed action");
      inspectRedemption(`0x${execution.slice(managerPrefix.length)}`, owner, depth + 1);
    }
    // The manager emits redemption events after execution, so inner evidence
    // precedes outer evidence. Each layer has its own actual caller.
    expectedRedemptions.push(...delegations.map((delegation) => ({ redeemer, delegation })));
  };
  inspectRedemption(transaction.input, transaction.from, 0);

  await assertStableWalletCodeAtExecution(client, receipt, owner, chainId);
  const [managerCode, ownerCode, implementationCode] = await Promise.all([
    client.request({ method: "eth_getCode", params: [METAMASK_EXECUTION.manager, receipt.blockNumber] }),
    client.request({ method: "eth_getCode", params: [owner, receipt.blockNumber] }),
    client.request({ method: "eth_getCode", params: [METAMASK_EXECUTION.implementation, receipt.blockNumber] }),
  ]);
  if (
    !managerCode ||
    keccak256(managerCode) !== METAMASK_EXECUTION.managerCodeHash ||
    !sameHex(ownerCode, `0xef0100${METAMASK_EXECUTION.implementation.slice(2)}`) ||
    !implementationCode ||
    keccak256(implementationCode) !== METAMASK_EXECUTION.implementationCodeHash
  )
    fail("the historical wallet execution code is not supported");

  const redeemed = receipt.logs.flatMap((log) => {
    if (!sameHex(log.address, METAMASK_EXECUTION.manager)) return [];
    try {
      return [
        decodeEventLog({
          abi: delegationManagerAbi,
          eventName: "RedeemedDelegation",
          data: log.data,
          topics: log.topics,
        }),
      ];
    } catch {
      return [];
    }
  });
  if (redeemed.length !== expectedRedemptions.length) fail("the redemption evidence is incomplete");
  for (const [i, event] of redeemed.entries()) {
    if (
      !sameHex(event.args.rootDelegator, owner) ||
      !sameHex(event.args.redeemer, expectedRedemptions[i]!.redeemer) ||
      encodeAbiParameters(delegationParameters, [[event.args.delegation]]) !==
        encodeAbiParameters(delegationParameters, [[expectedRedemptions[i]!.delegation]])
    )
      fail("the redemption event does not match the signed delegation");
  }
}
