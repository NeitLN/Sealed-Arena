// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {CapWalletO} from "./CapWalletO.sol";

/// Control group O+ for the comparison: CapWalletO with a list of allowed payees, set once at
/// deployment. Same caps and the same read-only ERC-1271 check; a transfer to any other address is
/// refused. Built by the team in a common style, not a copy of any product.
contract CapWalletOPlus is CapWalletO {
    mapping(address => bool) public isPayee;

    constructor(
        address usdc_,
        address agent_,
        uint256 perTxCap_,
        uint256 dailyCap_,
        address[] memory payees
    ) CapWalletO(usdc_, agent_, perTxCap_, dailyCap_) {
        for (uint256 i; i < payees.length; i++) {
            isPayee[payees[i]] = true;
        }
    }

    function _payeeAllowed(address to) internal view override returns (bool) {
        return isPayee[to];
    }
}
