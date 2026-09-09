/**
 * Codama codegen for the YieldShield SDK.
 *
 * Renders a @solana/kit-native TypeScript client from the Anchor IDLs, and vendors a copy of the
 * IDLs into the package so the SDK builds with zero dependency on the parent Anchor repo.
 *
 * Pipeline (per program):
 *   parent `target/idl/<name>.json`  ──copy──▶  packages/sdk/idl/<name>.json   (vendored, committed)
 *                                     ──render──▶ packages/sdk/src/generated/<name>/  (committed)
 *
 * The vendored IDL is the render source, so regeneration is reproducible even if the parent repo
 * is absent — in that case we fall back to the already-vendored copy and only re-render.
 *
 * Run:  npm run codegen   (from packages/sdk, or `npm run codegen` at the workspace root)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rootNodeFromAnchor, type AnchorIdl } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { createFromRoot } from "codama";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(SDK_DIR, "..", "..");
// Fresh-IDL source: set YS_IDL_DIR to the Anchor repo's target/idl, absolute or relative to this
// repo's root (e.g. ../yieldshield-solana/target/idl). Unset, codegen looks for a sibling
// yieldshield-solana checkout, else re-renders from the vendored copies.
const PARENT_IDL_DIR = process.env.YS_IDL_DIR
  ? resolve(REPO_ROOT, process.env.YS_IDL_DIR)
  : resolve(REPO_ROOT, "..", "yieldshield-solana", "target", "idl");
const VENDOR_IDL_DIR = resolve(SDK_DIR, "idl");
const GENERATED_DIR = resolve(SDK_DIR, "src", "generated");

/** Anchor IDL file name (in target/idl and idl/) per program. */
const PROGRAMS = [
  { idlFile: "split_risk_pool.json", clientDir: "pool" },
  { idlFile: "composite_oracle.json", clientDir: "oracle" },
] as const;

function vendorIdl(idlFile: string): AnchorIdl {
  const parentPath = resolve(PARENT_IDL_DIR, idlFile);
  const vendorPath = resolve(VENDOR_IDL_DIR, idlFile);
  let raw: string;
  if (existsSync(parentPath)) {
    raw = readFileSync(parentPath, "utf8");
    mkdirSync(VENDOR_IDL_DIR, { recursive: true });
    writeFileSync(vendorPath, raw);
    console.log(`  vendored ${idlFile}  (from parent target/idl)`);
  } else if (existsSync(vendorPath)) {
    raw = readFileSync(vendorPath, "utf8");
    console.log(`  using vendored ${idlFile}  (parent target/idl not found — render-only)`);
  } else {
    throw new Error(
      `IDL ${idlFile} not found in parent ${PARENT_IDL_DIR} nor vendored ${VENDOR_IDL_DIR}. ` +
        `Run \`anchor build\` in the parent repo first.`,
    );
  }
  return JSON.parse(raw) as AnchorIdl;
}

async function render(idl: AnchorIdl, clientDir: string): Promise<void> {
  const out = resolve(GENERATED_DIR, clientDir);
  rmSync(out, { recursive: true, force: true });

  // renderers-js scaffolds a sub-package: <scaffold>/{package.json, src/generated/**}.
  // We render into a scaffold dir, then flatten the real client (src/generated/**) up to `out`
  // and drop the scaffold so the SDK imports `./generated/<clientDir>` directly.
  const scaffold = resolve(GENERATED_DIR, `.${clientDir}-scaffold`);
  rmSync(scaffold, { recursive: true, force: true });
  const codama = createFromRoot(rootNodeFromAnchor(idl));
  await codama.accept(renderVisitor(scaffold));

  const rendered = resolve(scaffold, "src", "generated");
  if (!existsSync(rendered)) {
    throw new Error(`expected rendered client at ${rendered} — renderer layout changed?`);
  }
  cpSync(rendered, out, { recursive: true });
  rmSync(scaffold, { recursive: true, force: true });
  console.log(`  rendered src/generated/${clientDir}/`);
}

console.log("YieldShield SDK codegen");
for (const { idlFile, clientDir } of PROGRAMS) {
  console.log(`- ${idlFile} -> generated/${clientDir}`);
  const idl = vendorIdl(idlFile);
  await render(idl, clientDir);
}
console.log("done.");
