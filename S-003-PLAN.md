# 📋 Plan: S-003 - Dynamic Demo Upgrade

## 🎯 Objective
Convert the static `index.html` and `agent-commerce.html` into dynamic interfaces that pull live data from the AWM API.

## 🔍 Analysis
- **Current State**: The site uses `fallbackOffers` (hard-coded array) and static HTML for the "Intent 2" terminal.
- **Target State**:
    1. `offersGrid` $\to$ Live fetch from `/api/agent-products`.
    2. `terminal-body` $\to$ Live fetch from `bin/awm.js status <id>` (via a new proxy endpoint).
    3. `metrics` $\to$ Live fetch from the contract (total fees, etc.).

## 🛠️ Execution Steps

### Step 1: The API Bridge (Fixer)
- The current `api/agent-products.js` is a static handler reading from JSON files.
- **New Requirement**: Create `api/contract-status.js` that executes the `awm.js` CLI on the server and returns the JSON output of `status <id>`.

### Step 2: Frontend Integration (Fixer)
- **Dynamic Offers**: Update the `fetch('./api/agent-products')` logic in `index.html` to handle a wider range of product types.
- **Live Terminal**: Replace the static HTML in `.terminal-body` with a JS-driven update that calls `/api/contract-status?id=2`.
- **Live Metrics**: Create a simple endpoint to return the total fees and test counts from the contract.

### Step 3: Validation (Validator)
- **Visual Check**: Ensure the UI doesn't "flicker" while loading.
- **Data Check**: Verify that the numbers in the terminal match the actual on-chain state of Intent 2.
- **Error Handling**: Ensure the site falls back to `fallbackOffers` if the API is down.

## 🚩 Success Criteria
- Loading the page shows the *actual* current products from `catalog.json`.
- The terminal displays live data from the Base Sepolia contract.
- No console errors on page load.
