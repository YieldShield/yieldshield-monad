// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { MonadAssetOracle } from "./MonadAssetOracle.sol";

/// @notice Inventory-funded exchange for valueless scenario asset/USD tokens on Monad testnet.
/// @dev Anyone may fund it by transferring its configured tokens. No owner, external venue,
///      arbitrary recipient, minting, rescue, price setter, or recurring signer exists.
contract MonadAssetExchange is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error DemoChainOnly();
    error InvalidOracle();
    error InvalidTrade();
    error QuoteExpired();
    error SlippageExceeded();
    error InsufficientInventory();
    error InexactTransfer();

    uint256 public constant DEMO_CHAIN_ID = 10143;
    uint256 public constant feeBps = 30;
    uint256 public constant maxStockAmount = 25e18;
    mapping(address => uint256) public maxAssetAmount;
    mapping(address => uint256) public assetScale;
    uint256 public constant MAX_DEADLINE_DELAY = 10 minutes;
    MonadAssetOracle public immutable oracle;
    address public immutable quoteToken;
    mapping(address => bool) public supportedStock;

    event Swapped(
        address indexed trader,
        address indexed stock,
        bool buy,
        uint256 stockAmount,
        uint256 usdcAmount,
        uint256 feeAmount
    );

    constructor(address oracle_) {
        _requireDemoChain();
        if (oracle_.codehash != keccak256(type(MonadAssetOracle).runtimeCode)) revert InvalidOracle();
        oracle = MonadAssetOracle(oracle_);
        quoteToken = oracle.quoteToken();
        for (uint256 i; i < oracle.stockCount(); ++i) {
            address token = oracle.stockTokens(i);
            supportedStock[token] = true;
            uint8 d = oracle.tokenDecimals(token);
            assetScale[token] = 10 ** d;
            maxAssetAmount[token] = 25 * 10 ** d;
        }
    }

    /// @notice Exact asset quantity (native token decimals); total demo USD amount (6 decimals) includes fee.
    /// @dev A quote does not reserve inventory. Buys round cost up; sells round proceeds down.
    function quote(address stock, bool buy, uint256 stockAmount)
        public
        view
        returns (uint256 usdcAmount, uint256 feeAmount, uint256 price)
    {
        _requireDemoChain();
        if (!supportedStock[stock] || stockAmount == 0 || stockAmount > maxAssetAmount[stock]) revert InvalidTrade();
        price = oracle.getPrice(stock);
        uint256 notional = Math.mulDiv(stockAmount, price, assetScale[stock] * 100, buy ? Math.Rounding.Ceil : Math.Rounding.Floor);
        feeAmount = Math.mulDiv(notional, feeBps, 10000, Math.Rounding.Ceil);
        if (notional == 0 || (!buy && notional <= feeAmount)) revert InvalidTrade();
        usdcAmount = buy ? notional + feeAmount : notional - feeAmount;
        uint256 inventoryNeeded = buy ? stockAmount : usdcAmount;
        if (IERC20(buy ? stock : quoteToken).balanceOf(address(this)) < inventoryNeeded) {
            revert InsufficientInventory();
        }
    }

    /// @notice Buy: usdcLimit is MAX input. Sell: it is MIN output. All transfers use msg.sender.
    function swap(address stock, bool buy, uint256 stockAmount, uint256 usdcLimit, uint256 deadline)
        external
        nonReentrant
        returns (uint256 usdcAmount)
    {
        _requireDemoChain();
        if (deadline < block.timestamp || deadline - block.timestamp > MAX_DEADLINE_DELAY) revert QuoteExpired();
        if (usdcLimit == 0) revert InvalidTrade();
        uint256 feeAmount;
        (usdcAmount, feeAmount,) = quote(stock, buy, stockAmount);
        if ((buy && usdcAmount > usdcLimit) || (!buy && usdcAmount < usdcLimit)) revert SlippageExceeded();
        _transferExact(IERC20(buy ? quoteToken : stock), msg.sender, address(this), buy ? usdcAmount : stockAmount);
        _transferExact(IERC20(buy ? stock : quoteToken), address(this), msg.sender, buy ? stockAmount : usdcAmount);
        emit Swapped(msg.sender, stock, buy, stockAmount, usdcAmount, feeAmount);
    }

    function _transferExact(IERC20 token, address from, address to, uint256 amount) private {
        uint256 fromBefore = token.balanceOf(from);
        uint256 toBefore = token.balanceOf(to);
        if (from == address(this)) token.safeTransfer(to, amount);
        else token.safeTransferFrom(from, to, amount);
        uint256 fromAfter = token.balanceOf(from);
        uint256 toAfter = token.balanceOf(to);
        if (
            fromBefore < fromAfter || fromBefore - fromAfter != amount || toAfter < toBefore
                || toAfter - toBefore != amount
        ) revert InexactTransfer();
    }

    function _requireDemoChain() private view {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
    }
}
