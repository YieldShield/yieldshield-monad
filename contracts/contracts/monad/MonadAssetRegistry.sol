// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

interface IMonadAssetPrice {
    function getPriceWithStrictCircuitBreaker(address) external view returns (uint256);
    function isPriceStale(address) external view returns (bool, uint64);
}

/// @notice Immutable, bounded asset roles and valuation routes for Monad testnet.
/// @dev A zero source explicitly means a valueless test-dollar unit, never a market peg.
/// No owner or update path. New assets or routes require a separately reviewed deployment.
contract MonadAssetRegistry {
    error InvalidConfiguration();
    error UnavailableAsset();
    struct AssetConfig { address token; address source; address referenceToken; uint8 roles; }
    struct Route { address source; address referenceToken; bytes32 tokenHash; bytes32 sourceHash; uint8 roles; }
    mapping(address => Route) public routes;
    constructor(AssetConfig[] memory assets) {
        if (block.chainid != 10143 || assets.length == 0 || assets.length > 16) revert InvalidConfiguration();
        for (uint256 i; i < assets.length; ++i) {
            AssetConfig memory a = assets[i];
            if (a.token.code.length == 0 || routes[a.token].roles != 0 || a.roles == 0 || a.roles > 3) revert InvalidConfiguration();
            if (a.source == address(0)) {
                if (a.roles != 2 || a.referenceToken != address(0)) revert InvalidConfiguration();
            } else if (a.source.code.length == 0 || a.referenceToken == address(0)) revert InvalidConfiguration();
            routes[a.token] = Route(a.source, a.referenceToken, a.token.codehash, a.source.codehash, a.roles);
        }
    }
    function _route(address token) private view returns (Route memory r) {
        r = routes[token];
        if (block.chainid != 10143 || r.roles == 0 || token.codehash != r.tokenHash ||
            (r.source != address(0) && r.source.codehash != r.sourceHash)) revert UnavailableAsset();
    }
    function canProtect(address token) external view returns (bool) { return _route(token).roles & 1 != 0; }
    function canBack(address token) external view returns (bool) { return _route(token).roles & 2 != 0; }
    function getPrice(address token) public view returns (uint256 price) {
        Route memory r = _route(token);
        if (r.source == address(0)) return 1e8;
        (bool stale,) = IMonadAssetPrice(r.source).isPriceStale(r.referenceToken);
        if (stale) revert UnavailableAsset();
        price = IMonadAssetPrice(r.source).getPriceWithStrictCircuitBreaker(r.referenceToken);
        if (price == 0) revert UnavailableAsset();
    }
    function getPriceUnsafe(address token) external view returns (uint256) { return getPrice(token); }
    function getPriceForFeeAccrual(address token) external view returns (uint256) { return getPrice(token); }
    function getPriceWithStrictCircuitBreaker(address token) external view returns (uint256) { return getPrice(token); }
    function supportsCircuitBreaker(address token) external view returns (bool) { return block.chainid == 10143 && routes[token].roles != 0; }
    function supportsStrictProtectedPrice(address token) external view returns (bool) { return block.chainid == 10143 && routes[token].roles != 0; }
    function isPriceStale(address token) external view returns (bool, uint64) {
        try this.getPrice(token) returns (uint256 price) {
            Route memory r = routes[token];
            if (r.source == address(0)) return (price == 0, 0);
            return IMonadAssetPrice(r.source).isPriceStale(r.referenceToken);
        } catch { return (true, 0); }
    }
    function decimals() external pure returns (uint8) { return 8; }
    function description() external pure returns (string memory) { return "Monad testnet: strict references and explicit valueless test-dollar units"; }
}
