const BENEFITS = [
  { label: "Onchain clarity", path: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h4" },
  { label: "Direct access", path: "M4 12h15M13 5l7 7-7 7" },
  { label: "24/7 contract access", path: "M12 8v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z" },
  { label: "Gain sharing", path: "M4 17V7M12 17V4M20 17v-7M2 21h20" },
];

export function ProtocolBenefits() {
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-5 py-7 sm:grid-cols-4 sm:gap-5">
      {BENEFITS.map(({ label, path }) => (
        <li key={label} className="flex items-center gap-3 text-[13px] font-semibold sm:text-[14px]">
          <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={label === "Gain sharing" ? "shrink-0 text-junior" : "shrink-0 text-ink"}
          >
            <path d={path} />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}
