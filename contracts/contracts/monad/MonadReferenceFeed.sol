// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

interface IMonadPyth {
    struct Price { int64 price; uint64 conf; int32 expo; uint256 publishTime; }
    function getPriceUnsafe(bytes32 id) external view returns (Price memory);
    function getEmaPriceUnsafe(bytes32 id) external view returns (Price memory);
}
interface IShMonadValuation {
    function previewUnstake(uint256 shares) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
}
/// @notice Immutable MON/USD reference and shMON withdrawal-NAV valuation for testnet pools.
/// @dev TestUSDC is a valueless unit of account, NOT Circle USDC. shMON price is not an
/// executable sell quote: it excludes market discounts and the delay in native unstaking.
/// All entry points retain freshness, confidence and spot/EMA deviation checks. No synthetic fallback.
contract MonadReferenceFeed {
    error InvalidConfiguration();
    error UnavailablePrice();
    error UnsupportedToken();
    IMonadPyth public immutable pyth;
    bytes32 public immutable feedId;
    address public immutable wrappedMon;
    address public immutable shMon;
    address public immutable testUsd;
    uint256 public immutable referenceRate;
    uint256 public constant MAX_AGE = 120;
    uint256 public constant MAX_CONFIDENCE_BPS = 100;
    uint256 public constant MAX_EMA_DEVIATION_BPS = 2000;
    constructor(address pyth_, bytes32 id, address wmon, address lst, address usd) {
        if (block.chainid != 10143 || pyth_.code.length == 0 || wmon.code.length == 0 ||
            lst.code.length == 0 || usd.code.length == 0 || wmon == lst || wmon == usd || lst == usd || id == bytes32(0)) revert InvalidConfiguration();
        pyth = IMonadPyth(pyth_); feedId = id; wrappedMon = wmon; shMon = lst; testUsd = usd;
        uint256 rate = _rate(lst);
        if (rate == 0) revert InvalidConfiguration();
        referenceRate = rate;
    }
    function decimals() external pure returns(uint8) { return 8; }
    function description() external pure returns(string memory) { return "Pyth MON/USD reference; shMON delayed withdrawal NAV; synthetic TestUSDC"; }
    function _rate(address token) private view returns(uint256) {
        uint256 accounting = IShMonadValuation(token).convertToAssets(1e18);
        uint256 withdrawal = IShMonadValuation(token).previewUnstake(1e18);
        return accounting < withdrawal ? accounting : withdrawal;
    }
    function redemptionRate() public view returns(uint256 rate) {
        rate = _rate(shMon);
        // Bound unexpected upward jumps; decreases remain visible, including slashing.
        if (rate == 0 || rate > referenceRate * 120 / 100) revert UnavailablePrice();
    }
    function _checked(IMonadPyth.Price memory p) private view returns(uint256) {
        if (p.price <= 0 || p.expo < -18 || p.expo > 0 || p.publishTime == 0 ||
            p.publishTime > block.timestamp || block.timestamp - p.publishTime > MAX_AGE ||
            uint256(p.conf) * 10000 > uint256(uint64(p.price)) * MAX_CONFIDENCE_BPS) revert UnavailablePrice();
        uint256 v = uint256(uint64(p.price));
        int32 shift = p.expo + 8;
        uint256 normalized = shift >= 0 ? v * 10 ** uint32(shift) : v / 10 ** uint32(-shift);
        if (normalized == 0) revert UnavailablePrice();
        return normalized;
    }
    function monPrice() public view returns(uint256 price, uint64 publishedAt) {
        if (block.chainid != 10143) revert InvalidConfiguration();
        IMonadPyth.Price memory p = pyth.getPriceUnsafe(feedId);
        price = _checked(p);
        uint256 ema = _checked(pyth.getEmaPriceUnsafe(feedId));
        uint256 diff = price > ema ? price - ema : ema - price;
        if (diff * 10000 > ema * MAX_EMA_DEVIATION_BPS) revert UnavailablePrice();
        publishedAt = uint64(p.publishTime);
    }
    function getPrice(address token) public view returns(uint256) {
        if (block.chainid != 10143) revert InvalidConfiguration();
        if (token == testUsd) return 1e8;
        if (token != wrappedMon && token != shMon) revert UnsupportedToken();
        (uint256 mon,) = monPrice();
        return token == wrappedMon ? mon : Math.mulDiv(mon, redemptionRate(), 1e18);
    }
    function getPriceUnsafe(address token) external view returns(uint256) { return getPrice(token); }
    function getPriceForFeeAccrual(address token) external view returns(uint256) { return getPrice(token); }
    function getPriceWithStrictCircuitBreaker(address token) external view returns(uint256) { return getPrice(token); }
    function supportsCircuitBreaker(address token) external view returns(bool) { return _supported(token); }
    function supportsStrictProtectedPrice(address token) external view returns(bool) { return _supported(token); }
    function isPriceStale(address token) external view returns(bool, uint64) {
        if (!_supported(token)) return (true, 0);
        try this.getPrice(token) returns(uint256 value) {
            return (value == 0, token == testUsd ? uint64(0) : uint64(pyth.getPriceUnsafe(feedId).publishTime));
        } catch { return (true, 0); }
    }
    function _supported(address token) private view returns(bool) {
        return block.chainid == 10143 && (token == wrappedMon || token == shMon || token == testUsd);
    }
}
