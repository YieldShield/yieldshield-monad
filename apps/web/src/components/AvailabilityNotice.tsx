import { Link } from "react-router-dom";
import { useProtectionStatus } from "@/data/protection-status";

export function AvailabilityNotice() {
  const { data, loading, fresh } = useProtectionStatus();
  const openCount = fresh ? (data?.assets.filter((a) => a.actions.openPosition.state === "available").length ?? 0) : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-white px-5 py-4 text-[13px]">
      <p className="font-bold">
        {loading
          ? "Checking protection availability…"
          : !fresh || !data?.deployment.verified
            ? "Availability could not be checked"
            : openCount
              ? `${openCount} test ${openCount === 1 ? "pool is" : "pools are"} accepting deposits`
              : data.deployment.status !== "complete"
                ? "Test pools are being prepared"
                : "New protection is currently unavailable"}
      </p>
      <Link to="/status" className="shrink-0 font-bold text-[#0052FF] underline underline-offset-2">
        View status
      </Link>
    </div>
  );
}
