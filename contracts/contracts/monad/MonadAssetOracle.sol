// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IOracleFeed } from "../interfaces/IOracleFeed.sol";

interface IDemoAccrualPrice { function getPriceForFeeAccrual(address token) external view returns (uint256); }

/// @notice Constructor-pinned routing for scenario crypto and genuinely backed vault shares.
/// @dev The execution venue reads the same source feeds that price the corresponding pools.
contract MonadAssetOracle {
    error InvalidConfiguration();
    address public quoteToken;
    address[] public stockTokens;
    mapping(address => address) public source;
    mapping(address => uint8) public tokenDecimals;

    constructor(address quote, address[] memory tokens, address[] memory feeds) {
        if (block.chainid != 10143 || tokens.length == 0 || tokens.length > 8 || tokens.length != feeds.length) {
            revert InvalidConfiguration();
        }
        if (IERC20Metadata(quote).decimals() != 6) revert InvalidConfiguration();
        quoteToken = quote;
        for (uint256 i; i < tokens.length; ++i) {
            address token = tokens[i];
            uint8 d = IERC20Metadata(token).decimals();
            if (token == quote || source[token] != address(0) || feeds[i].code.length == 0 || d > 18) {
                revert InvalidConfiguration();
            }
            if (IOracleFeed(feeds[i]).decimals() != 8 || IOracleFeed(feeds[i]).getPrice(token) == 0) {
                revert InvalidConfiguration();
            }
            source[token] = feeds[i];
            tokenDecimals[token] = d;
            stockTokens.push(token);
        }
    }

    function stockCount() external view returns (uint256) { return stockTokens.length; }
    function isDemo() external pure returns (bool) { return true; }
    function getPrice(address token) external view returns (uint256) {
        if (block.chainid != 10143 || source[token] == address(0)) revert InvalidConfiguration();
        return IDemoAccrualPrice(source[token]).getPriceForFeeAccrual(token);
    }
}
