// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// Sample contract that keeps the Foundry toolchain exercised. Removed in T10.
contract Placeholder {
    error ZeroValue();

    uint256 public value;

    function set(uint256 newValue) external {
        if (newValue == 0) revert ZeroValue();
        value = newValue;
    }
}
