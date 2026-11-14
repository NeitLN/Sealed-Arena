// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {Placeholder} from "../src/Placeholder.sol";

/// Sample test that keeps the Foundry toolchain exercised until T10 replaces it.
contract PlaceholderTest is Test {
    Placeholder internal placeholder;

    function setUp() public {
        placeholder = new Placeholder();
    }

    function test_SetStoresValue() public {
        placeholder.set(42);
        assertEq(placeholder.value(), 42);
    }

    function test_RevertWhen_ValueIsZero() public {
        vm.expectRevert(Placeholder.ZeroValue.selector);
        placeholder.set(0);
    }
}
