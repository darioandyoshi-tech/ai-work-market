# x402 → AI Work Market (AWM) Handoff Demo

This demo illustrates the critical crossover point where a pay-per-call agent interaction (x402) transitions into a scoped, escrowed delivery of complex integration work (AI Work Market).

## The Thesis

x402 is excellent for **paid access**, **pay-per-call**, and **micropayments**. 
AI Work Market is designed for **deliverable-based work** that requires:
- Terms and Conditions
- Escrow (funding commitment)
- Proof of delivery (URI)
- Review and Release/Refund/Dispute paths

**This demo shows how a request for a complex integration results in a "Handoff" response that provides both the x402 access token and the AWM Escrow offer.**

## Quick Start

### 1. Start the Demo Server
```bash
node server.js
```

### 2. Run the Demo Client
In a separate terminal:
```bash
node client.js
```

## The Flow

1. **Request Quote:** The client asks for a custom integration quote.
2. **Handoff Response:** The server returns a response that contains:
   - `x402_access_meta`: How to continue the consultation via x402.
   - `awm_work_spec`: The scope of the 48-hour integration sprint.
   - `awm_offer`: The signing and funding instructions for the escrow.
   - `proof_convention`: How the worker will submit proof of completion.

This makes the core sales claim tangible: **x402 starts the interaction; AWM settles the work.**

## Sprint Offer
This demo is a precursor to the **$1,500 / 48h x402 → Escrow Integration Sprint**.
- **Scope:** One quote/intake flow, one AWM offer template, one Base Sepolia escrow dry run, and a handoff runbook.
- **Network:** Base Sepolia (testnet only).
- **Sellers:** AI Work Market.
