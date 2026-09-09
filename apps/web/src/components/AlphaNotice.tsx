import { AvailabilityNotice } from "@/components/AvailabilityNotice";
import { Link, NavLink } from "react-router-dom";
import { INFORMATION_NAVIGATION } from "@/lib/site-navigation";
export function AlphaNotice() {
  return (
    <div className="border-b border-[#e5dfe9] bg-[#f2eef6] px-4 py-2 text-center text-[11px] leading-relaxed text-[#66576f]">
      <strong>Base Sepolia demo</strong> · Test tokens only.{" "}
      <Link to="/risks" className="font-bold underline underline-offset-2">
        Details
      </Link>
    </div>
  );
}
export function LegalLinks() {
  return (
    <nav
      aria-label="Legal and product information"
      className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[12px] text-body"
    >
      {INFORMATION_NAVIGATION.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => (isActive ? "font-bold text-ink" : "hover:text-ink")}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function DeploymentStatus() {
  return (
    <div className="my-4">
      <AvailabilityNotice />
    </div>
  );
}
