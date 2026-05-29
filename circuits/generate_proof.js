#!/usr/bin/env node
/**
 * Test script: Generate Groth16 proof for IntentProof.
 * Uses circomlibjs for Poseidon hashing.
 */

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

// Intent #3 data (from on-chain)
const BUYER = "0xec89c40CA296F502cD033e07f18DA5E01cdd197d";
const SELLER = "0x50E85593b2CbCfcc53324a41CDA41Fe7bAf89028";

// Convert hex address to field element (just the integer value)
function addrToField(addr) {
    return BigInt(addr).toString();
}

async function main() {
    console.log("Building Poseidon hash function...");
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // Choose a random secret
    const secret = BigInt("0x" + require("crypto").randomBytes(16).toString("hex"));
    console.log("Secret:", secret.toString());

    // Compute workHash = poseidon(buyer, seller, secret)
    const buyerField = addrToField(BUYER);
    const sellerField = addrToField(SELLER);
    
    const hash = poseidon([buyerField, sellerField, secret.toString()]);
    const workHash = F.toObject(hash);
    console.log("WorkHash (public commitment):", workHash.toString());
    console.log("WorkHash (hex):", "0x" + workHash.toString(16).padStart(64, "0"));

    // Build witness input for circom
    const input = {
        buyer: buyerField,
        seller: sellerField,
        workHash: workHash.toString(),
        secret: secret.toString(),
    };

    fs.writeFileSync(path.join(__dirname, "input.json"), JSON.stringify(input, null, 2));
    console.log("\nWitness input written to input.json");

    // Generate witness
    console.log("\nGenerating witness...");
    const wasmPath = path.join(__dirname, "IntentProof_js", "IntentProof.wasm");
    const wtnsPath = path.join(__dirname, "witness.wtns");
    
    await snarkjs.wtns.calculate(input, wasmPath, wtnsPath);
    console.log("Witness generated:", wtnsPath);

    // Load zkey
    const zkeyPath = path.join(__dirname, "IntentProof_0001.zkey");
    
    // Generate proof
    console.log("\nGenerating Groth16 proof...");
    const { proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, wtnsPath);
    
    console.log("Proof generated:");
    console.log("  pi_a:", proof.pi_a.slice(0, 2).map((x) => x.slice(0, 30) + "..."));
    console.log("  pi_b:", "[Redacted for brevity]");
    console.log("  pi_c:", proof.pi_c.slice(0, 2).map((x) => x.slice(0, 30) + "..."));
    console.log("  Public signals:", publicSignals);

    // Save proof
    fs.writeFileSync(path.join(__dirname, "proof.json"), JSON.stringify(proof, null, 2));
    fs.writeFileSync(path.join(__dirname, "public.json"), JSON.stringify(publicSignals, null, 2));
    console.log("\nProof saved to proof.json");
    console.log("Public signals saved to public.json");

    // Verify locally
    console.log("\nVerifying proof locally...");
    const vkey = JSON.parse(fs.readFileSync(path.join(__dirname, "verification_key.json")));
    const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    console.log("Local verification:", verified ? "✅ VALID" : "❌ INVALID");

    // Generate Solidity calldata for contract
    console.log("\nGenerating Solidity calldata...");
    const calldata = await snarkjs.zkey.exportSolidityCalldata(
        path.join(__dirname, "public.json"),
        path.join(__dirname, "proof.json")
    );
    console.log("Calldata for submitProofWithZK():", calldata.substring(0, 200) + "...");
    
    // Also write as separate arrays for easier use in Python/web3
    const proofForContract = [
        proof.pi_a.slice(0, 2),
        proof.pi_b.slice(0, 2),
        proof.pi_c.slice(0, 2),
    ];
    
    const calldataObj = {
        proof: proofForContract,
        publicSignals: publicSignals,
    };
    
    fs.writeFileSync(
        path.join(__dirname, "proof_calldata.json"),
        JSON.stringify(calldataObj, null, 2)
    );
    console.log("Structured calldata saved to proof_calldata.json");

    return { verified, workHash: "0x" + workHash.toString(16).padStart(64, "0") };
}

main()
    .then((result) => {
        console.log("\n" + "=".repeat(60));
        console.log("ZK PROOF GENERATION COMPLETE");
        console.log("Verified:", result.verified);
        console.log("WorkHash:", result.workHash);
        console.log("=".repeat(60));
        process.exit(0);
    })
    .catch((err) => {
        console.error("Error:", err.message);
        console.error(err.stack);
        process.exit(1);
    });
