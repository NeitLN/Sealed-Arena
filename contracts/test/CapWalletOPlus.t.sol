// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {CapWalletOPlus} from "../src/controls/CapWalletOPlus.sol";
import {MockUSDC} from "./CapWalletO.t.sol";

/// O+ is O with a payee list: the same caps, and only listed payees.
contract CapWalletOPlusTest is Test {
    uint256 internal constant UNIT = 1e6;
    MockUSDC internal usdc;
    CapWalletOPlus internal wallet;
    address internal owner = makeAddr("owner");
    uint256 internal agentKey = 0xA11CE;
    address internal sellerA = makeAddr("sellerA");
    address internal sellerB = makeAddr("sellerB");
    address internal stranger = makeAddr("stranger");
    uint256 internal nextNonce;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        address[] memory payees = new address[](2);
        payees[0] = sellerA;
        payees[1] = sellerB;
        vm.prank(owner);
        wallet = new CapWalletOPlus(address(usdc), vm.addr(agentKey), UNIT / 2, UNIT, payees);
        usdc.mint(address(wallet), 3 * UNIT);
        vm.prank(owner);
        wallet.startDay();
    }

    function _pay(address to, uint256 value) internal returns (bool ok) {
        bytes32 nonce = bytes32(++nextNonce);
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                usdc.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                        address(wallet),
                        to,
                        value,
                        uint256(0),
                        validBefore,
                        nonce
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, digest);
        bytes memory sig =
            abi.encode(to, value, uint256(0), validBefore, nonce, abi.encodePacked(r, s, v));
        try usdc.transferWithAuthorization(
            address(wallet), to, value, 0, validBefore, nonce, sig
        ) {
            ok = true;
        } catch {}
    }

    function test_PaysAListedPayeeInsideTheCaps() public {
        assertTrue(_pay(sellerA, UNIT / 10));
        assertTrue(_pay(sellerB, UNIT / 10));
        assertEq(usdc.balanceOf(sellerA), UNIT / 10);
    }

    function test_RefusesAPayeeNotOnTheList() public {
        assertFalse(_pay(stranger, UNIT / 10));
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_KeepsTheCapsOfO() public {
        assertFalse(_pay(sellerA, 6 * UNIT / 10)); // above the per-payment cap
        assertTrue(_pay(sellerA, 4 * UNIT / 10));
        assertTrue(_pay(sellerB, 4 * UNIT / 10));
        assertFalse(_pay(sellerA, 4 * UNIT / 10)); // past the daily cap
    }

    function test_ExposesItsPayees() public view {
        assertTrue(wallet.isPayee(sellerA));
        assertFalse(wallet.isPayee(stranger));
    }
}
