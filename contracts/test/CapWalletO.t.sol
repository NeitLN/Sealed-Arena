// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {CapWalletO} from "../src/controls/CapWalletO.sol";

/// The part of USDC v2.2 that matters here: EIP-3009 transferWithAuthorization with a bytes
/// signature, checked through ERC-1271 when `from` is a contract.
contract MockUSDC {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("USD Coin"),
                keccak256("2"),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external {
        require(block.timestamp > validAfter && block.timestamp < validBefore, "time");
        require(!authorizationState[from][nonce], "used");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                        from,
                        to,
                        value,
                        validAfter,
                        validBefore,
                        nonce
                    )
                )
            )
        );
        (bool ok, bytes memory ret) =
            from.staticcall(abi.encodeWithSelector(0x1626ba7e, digest, signature));
        require(ok && ret.length == 32 && abi.decode(ret, (bytes4)) == 0x1626ba7e, "invalid sig");
        authorizationState[from][nonce] = true;
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}

contract CapWalletOTest is Test {
    uint256 internal constant UNIT = 1e6; // USDC decimals
    MockUSDC internal usdc;
    CapWalletO internal wallet;
    address internal owner = makeAddr("owner");
    uint256 internal agentKey = 0xA11CE;
    address internal seller = makeAddr("seller");
    uint256 internal nextNonce;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        vm.prank(owner);
        wallet = new CapWalletO(address(usdc), vm.addr(agentKey), UNIT / 2, UNIT);
        usdc.mint(address(wallet), 3 * UNIT);
        vm.prank(owner);
        wallet.startDay();
    }

    struct Auth {
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }

    function _auth(uint256 value) internal returns (Auth memory a) {
        a = Auth(seller, value, 0, block.timestamp + 1 hours, bytes32(++nextNonce));
    }

    function _digest(Auth memory a) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                usdc.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                        address(wallet),
                        a.to,
                        a.value,
                        a.validAfter,
                        a.validBefore,
                        a.nonce
                    )
                )
            )
        );
    }

    function _sig(Auth memory a, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(a));
        return abi.encode(
            a.to, a.value, a.validAfter, a.validBefore, a.nonce, abi.encodePacked(r, s, v)
        );
    }

    function _pay(Auth memory a, bytes memory sig) internal {
        usdc.transferWithAuthorization(
            address(wallet), a.to, a.value, a.validAfter, a.validBefore, a.nonce, sig
        );
    }

    function _valid(Auth memory a, bytes memory sig) internal view returns (bool) {
        return wallet.isValidSignature(_digest(a), sig) == bytes4(0x1626ba7e);
    }

    function test_AcceptsAPaymentInsideTheCaps() public {
        Auth memory a = _auth(4 * UNIT / 10);
        bytes memory sig = _sig(a, agentKey);
        assertTrue(_valid(a, sig));
        _pay(a, sig);
        assertEq(usdc.balanceOf(seller), 4 * UNIT / 10);
    }

    function test_RefusesAboveThePerTransactionCap() public {
        Auth memory a = _auth(6 * UNIT / 10);
        assertFalse(_valid(a, _sig(a, agentKey)));
    }

    function test_RefusesAboveTheDailyCap() public {
        Auth memory a1 = _auth(4 * UNIT / 10);
        _pay(a1, _sig(a1, agentKey));
        Auth memory a2 = _auth(4 * UNIT / 10);
        _pay(a2, _sig(a2, agentKey));
        Auth memory a3 = _auth(4 * UNIT / 10); // 0.8 spent + 0.4 > 1
        bytes memory sig = _sig(a3, agentKey);
        assertFalse(_valid(a3, sig));
        vm.expectRevert("invalid sig");
        _pay(a3, sig);
    }

    function test_RefusesAnotherSigner() public {
        Auth memory a = _auth(UNIT / 10);
        assertFalse(_valid(a, _sig(a, 0xB0B)));
    }

    function test_RefusesParametersThatDoNotMatchTheHash() public {
        Auth memory a = _auth(UNIT / 10);
        bytes memory sig = _sig(a, agentKey);
        Auth memory other = a;
        other.value = UNIT / 20;
        assertEq(wallet.isValidSignature(_digest(other), sig), bytes4(0xffffffff));
    }

    /// The agent signed a transfer of 0.9 but the bytes declare 0.1 to pass the cap.
    function test_RefusesDeclaredParametersThatUnderstateTheSignedTransfer() public {
        Auth memory real = _auth(9 * UNIT / 10);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, _digest(real));
        bytes memory lie = abi.encode(
            real.to,
            UNIT / 10,
            real.validAfter,
            real.validBefore,
            real.nonce,
            abi.encodePacked(r, s, v)
        );
        assertEq(wallet.isValidSignature(_digest(real), lie), bytes4(0xffffffff));
        vm.expectRevert("invalid sig");
        _pay(real, lie);
    }

    /// (r, n - s) with the other v recovers the same signer; only the low-s form is accepted.
    function test_RefusesTheHighSFormOfAValidSignature() public {
        Auth memory a = _auth(UNIT / 10);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, _digest(a));
        uint256 n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141; // secp256k1
        bytes32 highS = bytes32(n - uint256(s));
        uint8 otherV = v == 27 ? 28 : 27;
        assertEq(ecrecover(_digest(a), otherV, r, highS), vm.addr(agentKey));
        bytes memory sig = abi.encode(
            a.to, a.value, a.validAfter, a.validBefore, a.nonce, abi.encodePacked(r, highS, otherV)
        );
        assertFalse(_valid(a, sig));
    }

    function test_RefusesOnANewDayUntilTheOwnerStartsIt() public {
        vm.warp(block.timestamp + 1 days);
        Auth memory a = _auth(UNIT / 10);
        bytes memory sig = _sig(a, agentKey);
        assertFalse(_valid(a, sig));
        vm.prank(owner);
        wallet.startDay();
        assertTrue(_valid(a, sig));
    }

    function test_OnlyOwnerStartsTheDayAndWithdraws() public {
        vm.expectRevert(CapWalletO.NotOwner.selector);
        wallet.startDay();
        vm.expectRevert(CapWalletO.NotOwner.selector);
        wallet.withdraw(seller, 1);
        vm.prank(owner);
        wallet.withdraw(owner, UNIT);
        assertEq(usdc.balanceOf(owner), UNIT);
    }

    /// Executed one after another, each payment is checked against the balance it sees, so the
    /// daily cap holds even when twenty authorizations were signed at once.
    function test_TwentySignedAtOnceSpendAtMostTheDailyCap() public {
        Auth[] memory auths = new Auth[](20);
        bytes[] memory sigs = new bytes[](20);
        for (uint256 i; i < 20; i++) {
            auths[i] = _auth(4 * UNIT / 10);
            sigs[i] = _sig(auths[i], agentKey);
            assertTrue(_valid(auths[i], sigs[i])); // each passes a check made before any settles
        }
        uint256 ok;
        for (uint256 i; i < 20; i++) {
            try usdc.transferWithAuthorization(
                address(wallet),
                auths[i].to,
                auths[i].value,
                auths[i].validAfter,
                auths[i].validBefore,
                auths[i].nonce,
                sigs[i]
            ) {
                ok++;
            } catch {}
        }
        assertEq(ok, 2);
        assertEq(usdc.balanceOf(seller), 8 * UNIT / 10);
    }
}
