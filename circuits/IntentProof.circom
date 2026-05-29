pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

/*
IntentProof: Proves the seller knows the workHash preimage.
Public inputs: buyer, seller, workHash
Private input: secret
Constraint: poseidon(buyer, seller, secret) == workHash
*/

template IntentProof() {
    signal input buyer;
    signal input seller;
    signal input workHash;
    signal input secret;

    component hash = Poseidon(3);
    hash.inputs[0] <== buyer;
    hash.inputs[1] <== seller;
    hash.inputs[2] <== secret;

    hash.out === workHash;
}

component main {public [buyer, seller, workHash]} = IntentProof();
