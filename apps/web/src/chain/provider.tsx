import type { ReactNode } from "react";
import { impl } from "@chain-impl";

/** Mounts this deployment's chain adapter (wallet discovery + hook context). */
export function ChainProvider({ children }: { children: ReactNode }) {
  const Provider = impl.ChainProvider;
  return <Provider>{children}</Provider>;
}
