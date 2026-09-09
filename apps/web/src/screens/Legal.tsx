import { Link, useLocation } from "react-router-dom";
const email = (
  <a className="text-[#0052FF] underline" href="mailto:david@yieldshield.ai">
    david@yieldshield.ai
  </a>
);
const pages: Record<string, { title: string; sections: { heading: string; body: React.ReactNode }[] }> = {
  legal: {
    title: "Imprint / Impressum",
    sections: [
      {
        heading: "Service provider",
        body: (
          <>
            Hawig Ventures UG (haftungsbeschränkt)
            <br />
            Herzogin-Juliana-Straße 7<br />
            55469 Simmern
            <br />
            Germany
          </>
        ),
      },
      { heading: "Represented by", body: "Managing Director: David Hawig" },
      { heading: "Commercial register", body: "HRB 24975, Amtsgericht Bad Kreuznach" },
      { heading: "Contact", body: email },
      {
        heading: "About this service",
        body: "YieldShield on Base is an experimental Base Sepolia demo for buying, selling and conditionally protecting valueless test tokens at synthetic prices. It does not offer real-stock ownership, mainnet trading, real-asset protection, custody, insurance, guaranteed returns, or individual investment advice.",
      },
    ],
  },
  risks: {
    title: "Early alpha. Significant risks.",
    sections: [
      {
        heading: "Use test tokens only",
        body: "Trades, protection and token requests run on Base Sepolia (chain 84532). The fixed-supply test stocks and TestUSDC have no monetary value, share ownership or redemption rights. They are not issued or backed by Coinbase, Circle, or the named companies. The faucet distributes existing test tokens. Do not send real assets to these contracts.",
      },
      {
        heading: "Protection can fail",
        body: "The word “protection” describes conditional contract mechanics, not a guarantee or insurance. Collateral can be insufficient, unavailable, or lose value. Other positions, fees, liquidity constraints, administrative actions, or a sharp price move can reduce a payout. You may lose the entire deposited balance. Providing collateral means taking the first losses.",
      },
      {
        heading: "Unaudited contracts",
        body: "Automated tests and internal agent reviews do not constitute an independent security audit. Bugs in contracts, modules, integrations, wallets or infrastructure can cause loss, lock funds, or produce incorrect displays. A modular deployment can preserve known behavior while still introducing undiscovered risks.",
      },
      {
        heading: "Synthetic prices and limited inventory",
        body: "An onchain formula creates predictable demo prices; it does not observe real stocks or use a mainnet stock-feed relay. The formula runs continuously, but quotes expire and trades can fail because of price limits, depleted inventory or network problems. TestUSDC’s fixed demo price is not a real-dollar peg or backing.",
      },
      {
        heading: "Short demo waiting periods",
        body: "New demo pools use a one-minute minimum before a protected exit and a two-minute collateral withdrawal notice. These shortened timings are for testing, not proposed terms for real assets. Eligibility still depends on the position’s actual terms and available funds.",
      },
      {
        heading: "Governance, withdrawal and availability",
        body: "Pool terms can include notice periods, fees and changes through governance. Emergency pauses and infrastructure failures can prevent actions. Read each pool’s actual terms and every wallet request. An approval lets a contract spend tokens up to its allowance. A timelock or disabled upgrade path does not remove all administrative or contract risks.",
      },
      {
        heading: "Illustrations are not forecasts",
        body: "Scenario calculations simplify the mechanics and exclude fees, transaction costs, competing claims and execution changes unless expressly stated. They do not show an executable quote, promised yield, expected return, insurance entitlement or investment recommendation.",
      },
      {
        heading: "Report a concern",
        body: (
          <>
            Stop interacting if the app displays unexpected networks, assets or transaction requests. Contact {email}{" "}
            with the public transaction hash and a description. Never send a seed phrase or private key.
          </>
        ),
      },
    ],
  },
  terms: {
    title: "Alpha terms of use",
    sections: [
      {
        heading: "Provider and scope",
        body: "The provider is Hawig Ventures UG (haftungsbeschränkt), at the address in the imprint. This free, experimental alpha is provided for evaluation and testing. Use is limited to adults who can lawfully access it. Mainnet tokenized-stock trading is not offered, including to U.S. users.",
      },
      {
        heading: "Test-only assets and pricing",
        body: "All trades, protection deposits, collateral, withdrawals and faucet distributions in this demo use fixed-supply Base Sepolia test tokens. Prices come from a synthetic onchain scenario, not real markets. Buying leaves test stock tokens unprotected in your wallet; protection requires a separate deposit. Never use real assets in this deployment.",
      },
      {
        heading: "Your wallet and instructions",
        body: "You control your wallet and authorize its transactions. Check the destination, chain, token, amount, allowance and maximum spend or minimum output before signing. Contract transactions may be irreversible. The operator does not ask for or need your seed phrase or private key.",
      },
      {
        heading: "No guaranteed outcome",
        body: (
          <>
            The software is unaudited and may fail, become unavailable, or change. There is no guaranteed protection,
            payout, yield or data accuracy. Read the{" "}
            <Link to="/risks" className="underline">
              risk disclosure
            </Link>
            . Nothing here is individual financial, legal or tax advice, an offer to buy securities, or an insurance
            contract.
          </>
        ),
      },
      {
        heading: "Acceptable use",
        body: "Do not misuse the service, overload its infrastructure, misrepresent test results as real returns, interfere with others’ access, or use it unlawfully. Report security issues privately using the contact address.",
      },
      {
        heading: "Mandatory rights",
        body: "These alpha terms do not exclude liability for intent, gross negligence, injury to life, body or health, or other liability that cannot lawfully be excluded. Mandatory consumer protections and statutory rights remain applicable.",
      },
      {
        heading: "Contact and version",
        body: (
          <>
            Questions: {email}. Version: 8 September 2026. Material changes to the alpha may require updated
            disclosures.
          </>
        ),
      },
    ],
  },
  privacy: {
    title: "Privacy notice",
    sections: [
      {
        heading: "Controller",
        body: (
          <>
            Hawig Ventures UG (haftungsbeschränkt), Herzogin-Juliana-Straße 7, 55469 Simmern, Germany. Managing
            Director: David Hawig. Privacy contact: {email}.
          </>
        ),
      },
      {
        heading: "Website delivery and security",
        body: "When you visit, hosting and network providers process connection information such as IP address, request time, browser information, requested path and technical errors. We use Vercel for the website and Railway for the data service. Processing supports delivery, reliability and abuse prevention under Article 6(1)(f) GDPR. Technical records are retained only as required for these purposes and applicable provider retention settings; the application does not maintain a user account database.",
      },
      {
        heading: "Wallet and public blockchain data",
        body: "Connecting a wallet shares its public address with this browser application. To show balances, positions and transaction status, the application sends public addresses and contract queries to Base RPC infrastructure. Your wallet may also use its own providers. The connection state can be retained locally by the wallet integration. Requested functionality is processed under Article 6(1)(b) GDPR; operational security under Article 6(1)(f). Disconnect through the app or wallet and clear site data to remove locally stored connection state.",
      },
      {
        heading: "Public transactions cannot be deleted",
        body: "A signed testnet transaction can publicly record your wallet address, amounts and contract interactions on Base Sepolia. Block explorers and other parties can index them and link activity over time. Blockchain records are outside our control and cannot be erased by deleting browser data or contacting the operator.",
      },
      {
        heading: "Other recipients and transfers",
        body: "The site loads Hanken Grotesk from Google Fonts, which receives the connection data needed to serve font files. Vercel, Railway, RPC providers, font providers and your selected wallet may process data outside the EEA under their applicable transfer arrangements. Their privacy notices describe their processing: vercel.com/legal/privacy-policy, railway.com/legal/privacy, policies.google.com/privacy and base.org/privacy-policy. These third-party services have their own retention periods and responsibilities.",
      },
      {
        heading: "No advertising analytics in this alpha",
        body: "This application does not add advertising trackers, behavioural analytics, a mailing-list form or a profiling system. Essential wallet connection storage and hosting/security technologies may still apply. External links contact the destination service when opened.",
      },
      {
        heading: "Contact messages",
        body: "If you email us, we process your address and message to respond, under Article 6(1)(b) or (f) GDPR as applicable. We retain correspondence as needed to resolve the request and fulfil legal retention duties. Do not include private keys or seed phrases.",
      },
      {
        heading: "Your rights",
        body: (
          <>
            Where applicable, you may request access, correction, erasure, restriction and portability; object to
            processing based on legitimate interests; and withdraw any consent you gave without affecting prior lawful
            processing. Contact {email}. You may complain to a supervisory authority, including the Landesbeauftragte
            für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz. Public blockchain records cannot be
            removed by this operator.
          </>
        ),
      },
      {
        heading: "Version",
        body: "8 September 2026. This notice describes the current alpha and will be updated if its data processing changes.",
      },
    ],
  },
};
export function Legal() {
  const location = useLocation();
  const page = pages[location.pathname.slice(1)] ?? pages.legal!;
  return (
    <article className="mx-auto max-w-[740px]">
      <h1 className="page-title mb-8">{page.title}</h1>
      <div className="space-y-7">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-2 text-[17px] font-bold">{section.heading}</h2>
            <p className="text-[15px] leading-relaxed text-body">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
