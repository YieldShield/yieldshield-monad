import appleLogo from "@/assets/stocks/apple.svg";
import nvidiaLogo from "@/assets/stocks/nvidia.svg";
import metaLogo from "@/assets/stocks/meta.svg";
import alphabetLogo from "@/assets/stocks/alphabet.jpg";
import wethLogo from "@/assets/stocks/weth.svg";
import btcLogo from "@/assets/stocks/cbbtc.svg";
import vaultUsdcLogo from "@/assets/stocks/vault-usdc.svg";
import vaultWethLogo from "@/assets/stocks/vault-weth.svg";

/** Curated display metadata only; token and pool verification stays in the chain adapter. */
export const STOCKS = [
  { symbol: "tAAPLc", name: "Apple", logo: appleLogo },
  { symbol: "tNVDAc", name: "NVIDIA", logo: nvidiaLogo },
  { symbol: "tMETAc", name: "Meta", logo: metaLogo },
  { symbol: "tGOOGLc", name: "Alphabet", logo: alphabetLogo },
] as const;
export const PROTECTED_ASSETS = [
  ...STOCKS.map((stock) => ({ ...stock, category: "Stock" })),
  { symbol: "tWETH", name: "Wrapped Ether", logo: wethLogo, category: "Crypto" },
  { symbol: "tcbBTC", name: "Coinbase wrapped Bitcoin", logo: btcLogo, category: "Crypto" },
  { symbol: "vWETH", name: "WETH Yield Vault", logo: vaultWethLogo, category: "Vault shares" },
] as const;
const ASSET_BRANDS = [...PROTECTED_ASSETS, { symbol: "vUSDC", name: "USDC Yield Vault", logo: vaultUsdcLogo }];

export function stockBrand(symbol: string) {
  return ASSET_BRANDS.find((stock) => stock.symbol === symbol);
}
