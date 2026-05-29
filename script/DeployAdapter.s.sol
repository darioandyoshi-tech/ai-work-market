// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {CommitRevealVerifierAdapter} from "../contracts/CommitRevealVerifierAdapter.sol";

contract DeployAdapter is Script {
    function run() external {
        address realVerifier = 0x09DF1d2D899412cB6c20c37A392610985b8a0d80;
        address escrow = 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2;

        vm.startBroadcast();
        CommitRevealVerifierAdapter adapter = new CommitRevealVerifierAdapter(realVerifier, escrow);
        console.log("Adapter deployed to:", address(adapter));
        vm.stopBroadcast();
    }
}
