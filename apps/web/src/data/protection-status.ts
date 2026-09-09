import { useEffect, useState } from "react";
import useSWR from "swr";
import { parseProtectionStatus, statusIsFresh } from "@/lib/protection-status";
export type { ActionStatus, ProtectionAsset, ProtectionStatus } from "@/lib/protection-status";

async function fetchProtectionStatus() {
  const response = await fetch("/api/protection-status", { signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!response.ok) throw new Error("Live protection status is temporarily unavailable.");
  return parseProtectionStatus(await response.json());
}
export function useProtectionStatus() {
  const { data, error, isLoading, mutate } = useSWR("base-protection-status-v1", fetchProtectionStatus, {
    refreshInterval: 5000,
    shouldRetryOnError: false,
  });
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, []);
  return { data, error, loading: isLoading, fresh: !error && statusIsFresh(data, now), refresh: mutate, now };
}
