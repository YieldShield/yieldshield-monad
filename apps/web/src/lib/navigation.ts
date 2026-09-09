import type { NavigationSection } from "./site-navigation";

/** Keep wallet/faucet return destinations inside this application. */
export function safeNextPath(value: string | null, fallback = "/markets"): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((char) => char.charCodeAt(0) <= 32)
  )
    return fallback;
  try {
    const url = new URL(value, "https://base.yieldshield.ai");
    if (url.origin !== "https://base.yieldshield.ai" || url.pathname.replace(/\/+$/, "") === "/connect")
      return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** Keep the parent section selected on detail pages and through wallet/token setup. */
export function getNavigationSection(pathname: string, search = ""): NavigationSection | undefined {
  let location = new URL(pathname + search, "https://base.yieldshield.ai");
  location.pathname = location.pathname.replace(/\/+$/, "") || "/";
  for (let depth = 0; depth < 5; depth++) {
    if (location.pathname !== "/connect" && location.pathname !== "/test-tokens") break;
    const next = new URLSearchParams(location.search).get("next");
    location = new URL(safeNextPath(next), location.origin);
    location.pathname = location.pathname.replace(/\/+$/, "") || "/";
  }
  const path = location.pathname.replace(/\/$/, "") || "/";
  const groups: [NavigationSection, string[]][] = [
    ["trade", ["/trade"]],
    ["protection", ["/markets", "/explore", "/pool", "/protection", "/deposit"]],
    ["positions", ["/positions", "/position", "/activate", "/activity"]],
    ["collateral", ["/provide", "/protect", "/underwriter", "/create-pool"]],
    ["account", ["/account"]],
  ];
  return groups.find(([, prefixes]) =>
    prefixes.some((prefix) => path === prefix || path.startsWith(prefix + "/")),
  )?.[0];
}

/** Setup links carry the current selection without nesting a faucet inside itself. */
export function setupLink(target: "/connect" | "/test-tokens", pathname: string, search = "", hash = ""): string {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const current =
    normalizedPath === "/connect"
      ? safeNextPath(new URLSearchParams(search).get("next"))
      : normalizedPath === "/welcome" || normalizedPath === "/"
        ? "/markets"
        : safeNextPath(pathname + search + hash);
  if (
    target === "/test-tokens" &&
    new URL(current, "https://base.yieldshield.ai").pathname.replace(/\/+$/, "") === target
  )
    return current;
  return `${target}?next=${encodeURIComponent(current)}`;
}

/** Cancelling connection must not send a disconnected wallet back into its guard. */
export function connectionBackPath(next: string): string {
  const safe = safeNextPath(next);
  const pathname = new URL(safe, "https://base.yieldshield.ai").pathname;
  const guarded = ["/positions", "/position", "/activate", "/create-pool", "/underwriter", "/activity", "/account"];
  return guarded.some((path) => pathname === path || pathname.startsWith(path + "/")) ? "/markets" : safe;
}
