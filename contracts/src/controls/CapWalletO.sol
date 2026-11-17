// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

interface IUSDC {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// Control group O for the comparison (T14): a spending-limit wallet built by the team in a common
/// style, not a copy of any product. It holds USDC and pays x402 sellers with EIP-3009
/// transferWithAuthorization; USDC asks this contract (ERC-1271) whether the agent's signature is
/// valid, and the limits are checked there, read-only:
///   value <= perTxCap and (balance at the start of the day - balance now) + value <= dailyCap.
/// The signature bytes carry the transfer parameters, so the wallet can rebuild the USDC digest and
/// see the amount. The owner records the start-of-day balance with startDay(); on a new day no
/// signature is valid until it does. Deposits during a day count against spending (simplification).
contract CapWalletO {
    bytes4 internal constant MAGIC = 0x1626ba7e;
    bytes4 internal constant INVALID = 0xffffffff;
    bytes32 internal constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    uint256 internal constant HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    IUSDC public immutable usdc;
    address public immutable owner;
    address public immutable agent;
    uint256 public immutable perTxCap;
    uint256 public immutable dailyCap;
    uint256 public day;
    uint256 public dayStartBalance;

    error NotOwner();

    constructor(address usdc_, address agent_, uint256 perTxCap_, uint256 dailyCap_) {
        usdc = IUSDC(usdc_);
        owner = msg.sender;
        agent = agent_;
        perTxCap = perTxCap_;
        dailyCap = dailyCap_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function startDay() external onlyOwner {
        day = block.timestamp / 1 days;
        dayStartBalance = usdc.balanceOf(address(this));
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(usdc.transfer(to, amount), "transfer failed");
    }

    /// Spent today as seen from the balance.
    function spentToday() public view returns (uint256) {
        uint256 bal = usdc.balanceOf(address(this));
        return dayStartBalance > bal ? dayStartBalance - bal : 0;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        (
            address to,
            uint256 value,
            uint256 validAfter,
            uint256 validBefore,
            bytes32 nonce,
            bytes memory sig
        ) = abi.decode(signature, (address, uint256, uint256, uint256, bytes32, bytes));
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                usdc.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                        address(this),
                        to,
                        value,
                        validAfter,
                        validBefore,
                        nonce
                    )
                )
            )
        );
        if (digest != hash) return INVALID;
        if (_recover(hash, sig) != agent) return INVALID;
        if (day != block.timestamp / 1 days) return INVALID;
        if (!_payeeAllowed(to)) return INVALID;
        if (value > perTxCap) return INVALID;
        if (spentToday() + value > dailyCap) return INVALID;
        return MAGIC;
    }

    /// O has no payee list; O+ (CapWalletOPlus) overrides this with one.
    function _payeeAllowed(address) internal view virtual returns (bool) {
        return true;
    }

    function _recover(bytes32 h, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (uint256(s) > HALF_N) return address(0);
        return ecrecover(h, v, r, s);
    }
}
