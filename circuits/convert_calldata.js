#!/usr/bin/env node
/**
 * Convert snarkjs proof.json into Solidity calldata for submitProofWithZK().
 */

const fs = require("fs");
const path = require("path");

const proof = JSON.parse(fs.readFileSync(path.join(__dirname, "proof.json")));
const public = JSON.parse(fs.readFileSync(path.join(__dirname, "public.json")));

// snarkjs format:
// proof.pi_a = [x, y, 1]       -> drop last element
// proof.pi_b = [[x, y], [x, y], [1, 0]] -> just the 2x2
// proof.pi_c = [x, y, 1]       -> drop last element

const solProof = {
    pA: proof.pi_a.slice(0, 2),
    pB: [
        proof.pi_b[0].slice(0, 2).map((x) => x.toString()),
        proof.pi_b[1].slice(0, 2).map((x) => x.toString()),
    ],
    pC: proof.pi_c.slice(0, 2),
};

// For the contract, the public signals should be:
// [buyer (field), seller (field), workHash (field)]
// Already in public.json

console.log("Solidity Calldata for submitProofWithZK(intentId, proof, publicSignals):");
console.log("\nProof struct:");
console.log(JSON.stringify(solProof, null, 2));

console.log("\nPublic signals (uint256[3]):");
console.log(JSON.stringify(public, null, 2));

// As a single flat array for cast / web3
const flatProof = [
    ...solProof.pA,
    ...solProof.pB[0],
    ...solProof.pB[1],
    ...solProof.pC,
];

const calldataObj = {
    proof_flat: flatProof,
    publicSignals: public,
};

fs.writeFileSync(
    path.join(__dirname, "proof_calldata.json"),
    JSON.stringify(calldataObj, null, 2)
);

console.log("\n✅ Calldata written to proof_calldata.json");
