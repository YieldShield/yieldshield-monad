import { main as runWorkflow } from './workflow';

// CRE's compiler wraps this named entry point with its WASM error boundary.
export async function main() {
  await runWorkflow();
}
