import deployment from "../../../config/deployment.json";
import { TokenIcon } from "./AssetImage";
import "./exit-explainer.css";
const asset = deployment.assets.find((item) => item.id === "wmon");
const backing = deployment.assets.find((item) => item.id === "test-usd");

export function ExitExplainer() {
  return (
    <div className="exit-explainer">
      <div className="exit-stage" aria-hidden="true">
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
      <p className="exit-caption">Your asset. Separately supplied backing.</p>
    </div>
  );
}
