const params = new URLSearchParams(location.search);
const allowedScreens = ["landing", "protect", "provide", "positions", "faucet"];
const direction = ["clarity", "nightfall", "direct"].includes(params.get("direction"))
  ? params.get("direction")
  : "clarity";
const state = {
  screen: allowedScreens.includes(params.get("screen")) ? params.get("screen") : "landing",
  asset: "WMON",
  backing: "TestUSDC",
  amount: params.get("screen") === "provide" ? "1000" : "1",
  exit: "position",
  playing: false,
};
const assets = {
  WMON: { name: "Wrapped MON", image: "monad.png", className: "", subtitle: "Native MON, wrapped" },
  shMON: { name: "Staked MON", image: "shmonad.webp", className: "staked", subtitle: "Through shMonad" },
  "sMON-demo": { name: "Demo MON", image: "scenario.svg", className: "", subtitle: "Synthetic test token" },
};
const root = document.getElementById("content");
const reduced = params.get("motion") === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches;
document.body.classList.add(direction);
if (reduced) document.body.classList.add("reduced-motion");
const image = (symbol, className = "asset-icon") =>
  `<img class="${className} ${assets[symbol].className}" src="assets/${assets[symbol].image}" alt="" width="44" height="44">`;
const captions = {
  position: "Your asset. Separately supplied backing.",
  asset: "Withdraw your asset, less fees on gains.",
  backing: "Surrender your asset for backing, within your cap.",
};
let timers = [],
  toastTimer;
function stopMotion() {
  timers.forEach(clearTimeout);
  timers = [];
  state.playing = false;
  const b = root.querySelector("[data-replay]");
  if (b) b.textContent = "Replay explanation ↻";
}
function setExit(exit) {
  state.exit = exit;
  root.querySelectorAll(".motion-stage").forEach((el) => (el.dataset.state = exit));
  root
    .querySelectorAll("[data-exit]")
    .forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.exit === exit)));
  root.querySelectorAll(".motion-caption").forEach((el) => (el.textContent = captions[exit]));
}
function explainer() {
  return `<div class="visual-explainer intro"><div class="motion-stage" data-state="${state.exit}" aria-hidden="true"><div class="stage-dots"></div><div class="orbit"></div><div class="orbit two"></div><div class="plate asset"><div class="plate-top"><div class="coin"><img src="assets/monad.png" alt="" width="42" height="42"></div><span>WMON</span></div><div class="plate-bottom"><strong>Your asset</strong></div></div><div class="plate backing"><div class="plate-top"><div class="coin"><img src="assets/test-usd.svg" alt="" width="42" height="42"></div><span>TESTUSDC</span></div><div class="plate-bottom"><strong>Backing</strong></div></div><div class="stage-bridge">⇄</div></div><div class="exit-switcher" role="group" aria-label="Explore exit choices"><button data-exit="position" aria-pressed="${state.exit === "position"}">Your position</button><button data-exit="asset" aria-pressed="${state.exit === "asset"}">Keep asset</button><button data-exit="backing" aria-pressed="${state.exit === "backing"}">Take backing</button></div><p class="motion-caption" aria-live="polite">${captions[state.exit]}</p>${reduced ? '<p class="motion-caption">Reduced motion · Select an exit above</p>' : '<button class="replay" data-replay>Replay explanation ↻</button>'}</div>`;
}
function assetOptions() {
  return `<section class="asset-section"><div class="section-heading"><h2>Start with an asset.</h2><span>Monad testnet</span></div><div class="asset-options">${Object.entries(
    assets,
  )
    .map(
      ([symbol, asset]) =>
        `<button class="asset-option" data-asset-protect="${symbol}">${image(symbol)}<span><strong>${asset.name}</strong><small>${symbol === "sMON-demo" ? "Synthetic demo" : symbol}</small></span><span class="arr" aria-hidden="true">↗</span></button>`,
    )
    .join("")}</div></section>`;
}
function form(compact = false) {
  const junior = state.screen === "provide";
  const unit = junior ? state.backing : state.asset;
  return `<section class="form-card">${compact ? "<h2>Choose your asset</h2>" : `<p class="field-label">${junior ? "Pool asset" : "Asset to protect"}</p>`}<div class="asset-tabs" role="group" aria-label="Choose an asset">${Object.keys(
    assets,
  )
    .map(
      (symbol) =>
        `<button class="asset-tab" data-asset="${symbol}" aria-pressed="${state.asset === symbol}">${image(symbol, "tab-icon")}<span>${symbol === "sMON-demo" ? "Demo" : symbol}</span></button>`,
    )
    .join(
      "",
    )}</div><label class="backing-choice"><span class="field-label">Backing</span><select id="backing" name="backing"><option value="TestUSDC" ${state.backing === "TestUSDC" ? "selected" : ""}>TestUSDC</option><option value="vTestUSDC" ${state.backing === "vTestUSDC" ? "selected" : ""} ${state.asset === "shMON" ? "disabled" : ""}>vTestUSDC · Vault shares</option></select></label><label class="field-label" for="amount">${junior ? "Backing to provide" : "Amount to protect"}</label><div class="amount-input"><input id="amount" name="amount" inputmode="decimal" autocomplete="off" aria-describedby="balance-note" value="${state.amount.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")}"><span>${unit}</span></div><p class="balance-note" id="balance-note">Connect to see your balance</p><dl class="terms">${junior ? "<div><dt>Reward share</dt><dd>10% of realized gains</dd></div><div><dt>Withdrawal notice</dt><dd>120 seconds</dd></div>" : "<div><dt>Fee on realized gains</dt><dd>12%</dd></div><div><dt>Backing exit after</dt><dd>60 seconds</dd></div>"}</dl>${compact ? '<a class="primary" href="#protect">Preview protection <span>↗</span></a>' : '<button class="primary" data-preview>Connect wallet <span>↗</span></button>'}<p class="form-note">${junior ? "Backing absorbs losses first. Only unreserved backing can be withdrawn." : "Backing payouts are capped by entry value and reserved backing. You surrender your asset to take this exit."}</p></section>`;
}
function landing() {
  return `<div class="page-inner"><section class="hero"><div class="hero-copy intro"><h1>Keep your<br>upside.<br><em>Choose your exit.</em></h1><p>Keep your asset, or exchange it for capped backing.</p><div class="hero-actions"><a class="primary" href="#protect">Protect tokens <span>↗</span></a><a class="text-link" href="#how-it-works">How it works <span>↗</span></a></div><small>Fees and waiting periods apply.</small></div>${direction === "direct" ? `<div class="compact-landing-form intro">${form(true)}</div>` : explainer()}</section>${direction === "direct" ? `<section class="direct-explainer"><div><h2>One position.<br>Two ways out.</h2><p>Your asset stays paired with separately supplied backing. Choose the exit that suits you, within the pool’s rules.</p></div>${explainer()}</section>` : assetOptions()}<div class="built-with"><span>Built with</span><b>Dynamic</b><b>shMonad</b><b>RedStone</b><span>on Monad</span></div></div>`;
}
function task() {
  const junior = state.screen === "provide";
  return `<div class="task-inner"><div class="task-heading"><h1>${junior ? "Provide liquidity" : "Protect"}</h1><span class="step-label">Monad testnet</span></div><div class="funding-line"><span>Need test tokens?</span><a href="#faucet">Go to Faucet ↗</a></div><div class="form-layout">${form()}<aside class="side-explain"><div class="side-art" aria-hidden="true"><i></i><i></i></div><h2>${junior ? "Supply the backing." : "Choose your exit."}</h2><p>${junior ? "Earn a share of realized gains by supplying backing to the pool." : "Keep your asset after fees, or surrender it for capped backing."}</p><p>${junior ? "Your backing takes losses first. Rewards are shared with other providers and are not guaranteed." : "Fees, waiting periods and pool checks apply."}</p><a href="#details">Read pool details ↗</a></aside></div></div>`;
}
function positions() {
  return `<div class="task-inner"><div class="task-heading"><h1>Your positions</h1><span class="step-label">Monad testnet</span></div><section class="empty-position"><div><div class="position-stack" aria-hidden="true"><i></i><i></i></div><h2>Your positions, in one place.</h2><p>Connect your wallet to view protected assets and supplied backing.</p><button class="primary" data-preview>Connect wallet <span>↗</span></button></div></section></div>`;
}
function faucet() {
  return `<div class="task-inner"><div class="task-heading"><h1>Faucet</h1><span class="step-label">Start here</span></div><div class="faucet-grid"><section class="faucet-card"><div class="step"><span>01</span>${image("WMON")}</div><h2>MON for fees.</h2><p>Get testnet MON before making a transaction.</p><button class="primary" data-preview>Open Monad faucet <span>↗</span></button></section><section class="faucet-card"><div class="step"><span>02</span>${image("sMON-demo")}</div><h2>Tokens to try it.</h2><p>Claim 25 sMON-demo and 10,000 TestUSDC.</p><button class="primary" data-preview>Connect wallet <span>↗</span></button></section></div><p class="form-note">Test tokens have no monetary value. Claims are limited to once every 24 hours, while supplies last.</p><section class="faucet-tools"><details><summary>Wrap MON</summary><p>Wrap MON 1:1 using YieldShield’s testnet wrapper.</p><button class="primary" data-preview>Preview wrapping ↗</button></details><details><summary>Stake MON with shMonad</summary><p>Receive shMON. Unstaking is delayed until the completion epoch.</p><button class="primary" data-preview>Preview staking ↗</button></details><details><summary>Prepare vault shares</summary><p>Deposit TestUSDC for vTestUSDC. Demo yield comes from funded donations.</p><button class="primary" data-preview>Preview vault deposit ↗</button></details></section></div>`;
}
function render() {
  stopMotion();
  root.innerHTML =
    state.screen === "landing"
      ? landing()
      : state.screen === "positions"
        ? positions()
        : state.screen === "faucet"
          ? faucet()
          : task();
  document
    .querySelectorAll("nav a")
    .forEach((a) =>
      a.getAttribute("href") === "#" + state.screen
        ? a.setAttribute("aria-current", "page")
        : a.removeAttribute("aria-current"),
    );
  document.querySelectorAll(".hero-copy .primary").forEach((a) => {
    if (direction === "direct") a.hidden = true;
  });
}
function route(screen) {
  if (!allowedScreens.includes(screen)) return;
  const keepAmount = direction === "direct" && state.screen === "landing" && screen === "protect";
  state.screen = screen;
  state.exit = "position";
  if (!keepAmount) state.amount = screen === "provide" ? "1000" : "1";
  history.replaceState(null, "", `?${new URLSearchParams({ direction, screen, motion: reduced ? "off" : "on" })}`);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  root.focus({ preventScroll: true });
}
function info(topic) {
  const heading = document.getElementById("dialog-title"),
    body = document.getElementById("dialog-body");
  heading.textContent =
    topic === "legal" ? "Testnet prototype" : topic === "details" ? "Pool details" : "Two ways to exit";
  body.innerHTML =
    topic === "legal"
      ? "<p>These are design mockups of YieldShield on Monad. No wallet is connected and no transactions are submitted.</p><p>The live product uses test tokens with no monetary value.</p>"
      : topic === "details"
        ? "<p>Reference pools use external MON prices. shMON is valued at its delayed withdrawal rate.</p><p>Protection pays a 12% fee on realized gains. A backing exit surrenders your remaining asset for a payout capped by entry value and reserved backing.</p><p>Providers absorb losses first. Only unreserved backing can be withdrawn after the notice period.</p>"
        : "<p><strong>Keep your asset.</strong> Withdraw the deposited asset, less fees on gains.</p><p><strong>Take the backing.</strong> Surrender the asset for backing, within the reserved cap and entry value.</p><p>Waiting periods and pool checks apply. The animation illustrates the choice; it is not a price quote.</p>";
  document.getElementById("info-dialog").showModal();
}
document.addEventListener("click", (event) => {
  const routeLink = event.target.closest('a[href^="#"]');
  if (routeLink) {
    const target = routeLink.getAttribute("href").slice(1);
    if (target === "content") return;
    event.preventDefault();
    allowedScreens.includes(target) ? route(target) : info(target);
    return;
  }
  const assetProtect = event.target.closest("[data-asset-protect]");
  if (assetProtect) {
    state.asset = assetProtect.dataset.assetProtect;
    if (state.asset === "shMON") state.backing = "TestUSDC";
    route("protect");
    return;
  }
  const asset = event.target.closest("[data-asset]");
  if (asset) {
    state.asset = asset.dataset.asset;
    if (state.asset === "shMON") state.backing = "TestUSDC";
    render();
    root.querySelector(`[data-asset="${state.asset}"]`)?.focus();
    return;
  }
  const exit = event.target.closest("[data-exit]");
  if (exit) {
    stopMotion();
    setExit(exit.dataset.exit);
    return;
  }
  const replay = event.target.closest("[data-replay]");
  if (replay) {
    if (state.playing) {
      stopMotion();
      return;
    }
    state.playing = true;
    replay.textContent = "Pause explanation";
    setExit("position");
    timers = [
      setTimeout(() => setExit("asset"), 1100),
      setTimeout(() => setExit("backing"), 2300),
      setTimeout(stopMotion, 3500),
    ];
    return;
  }
  if (event.target.closest("[data-preview]")) {
    const note = document.getElementById("preview-note");
    note.textContent = "Design preview only · No wallet connection or transaction.";
    note.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (note.hidden = true), 4200);
  }
});
root.addEventListener("input", (event) => {
  if (event.target.id === "amount") state.amount = event.target.value;
});
root.addEventListener("change", (event) => {
  if (event.target.id === "backing") {
    state.backing = event.target.value;
    render();
    root.querySelector("#backing")?.focus();
  }
});
document
  .querySelector("#info-dialog .close")
  .addEventListener("click", () => document.getElementById("info-dialog").close());
document.getElementById("info-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
render();
