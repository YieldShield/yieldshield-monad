import { useEffect, useId, useState } from "react";
import deployment from "../../../config/deployment.json";
import { TokenIcon } from "./AssetImage";
import "./exit-explainer.css";
const asset = deployment.assets.find((item) => item.id === "wmon");
const backing = deployment.assets.find((item) => item.id === "test-usd");

const exitChoices = [
  { id: "position", label: "Your position", caption: "Your asset. Separately supplied backing." },
  { id: "asset", label: "Keep asset", caption: "Withdraw your asset, less fees on gains." },
  { id: "backing", label: "Take backing", caption: "Surrender your asset for backing, within your cap." },
] as const;
type Exit = (typeof exitChoices)[number]["id"];

export function ExitExplainer() {
  const captionId = useId();
  const [exit, setExit] = useState<Exit>("position");
  const [playing, setPlaying] = useState(false);
  const [manualReduction, setManualReduction] = useState(false);
  const [systemReduction, setSystemReduction] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const reduced = manualReduction || systemReduction;
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setSystemReduction(media.matches);
      setPlaying(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!playing || reduced) return;
    const timers = [
      setTimeout(() => setExit("asset"), 1100),
      setTimeout(() => setExit("backing"), 2300),
      setTimeout(() => setPlaying(false), 3500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [playing, reduced]);
  return (
    <div className={`exit-explainer ${reduced ? "motion-reduced" : ""}`}>
      <div className="exit-stage" aria-hidden="true" data-state={exit}>
        <div className="exit-orbit" />
        <div className="exit-orbit outer" />
        <div className="exit-plate asset">
          <div className="exit-plate-top">
            <TokenIcon asset={asset} />
            <span>WMON</span>
          </div>
          <strong>Your asset</strong>
        </div>
        <div className="exit-plate backing">
          <div className="exit-plate-top">
            <TokenIcon asset={backing} />
            <span>TestUSDC</span>
          </div>
          <strong>Backing</strong>
        </div>
        <div className="exit-bridge">⇄</div>
      </div>
      <div className="exit-choices" role="group" aria-label="Explore exit choices" aria-describedby={captionId}>
        {exitChoices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            aria-pressed={exit === choice.id}
            onClick={() => {
              setPlaying(false);
              setExit(choice.id);
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <p className="exit-caption" id={captionId} aria-live="polite">
        {exitChoices.find((choice) => choice.id === exit)!.caption}
      </p>
      <div className="exit-motion-controls">
        {!reduced && (
          <button
            type="button"
            className="exit-replay"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                setExit("position");
                setPlaying(true);
              }
            }}
          >
            {playing ? "Pause explanation" : "Replay explanation ↻"}
          </button>
        )}
        <label className="exit-motion-toggle">
          <input
            type="checkbox"
            checked={reduced}
            disabled={systemReduction}
            onChange={(event) => {
              setManualReduction(event.target.checked);
              setPlaying(false);
            }}
          />
          Reduce motion
        </label>
      </div>
    </div>
  );
}
