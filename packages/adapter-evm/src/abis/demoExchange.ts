import { parseAbi } from "viem";
export const demoExchangeAbi = parseAbi([
  "function quote(address stock, bool buy, uint256 stockAmount) view returns (uint256 usdcAmount, uint256 feeAmount, uint256 price)",
  "function swap(address stock, bool buy, uint256 stockAmount, uint256 usdcLimit, uint256 deadline) returns (uint256 usdcAmount)",
  "function oracle() view returns (address)",
  "function quoteToken() view returns (address)",
  "function feeBps() view returns (uint256)",
  "function maxAssetAmount(address) view returns (uint256)",
  "function maxStockAmount() view returns (uint256)",
  "function supportedStock(address) view returns (bool)",
  "event Swapped(address indexed trader, address indexed stock, bool buy, uint256 stockAmount, uint256 usdcAmount, uint256 feeAmount)",
]);
export const demoOracleAbi = parseAbi([
  "function getPrice(address token) view returns (uint256)",
  "function isDemo() view returns (bool)",
]);
