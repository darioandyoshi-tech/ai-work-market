// assets/awm-shell.js — shared client script injected on every page.
// Responsibilities:
//   1. Wallet connect modal (works on any page, not just /connect)
//   2. Live system status bar (footer or top of every page)
//   3. Persists wallet address in localStorage; auto-reconnects on next page load
//   4. Handles the Base Mainnet / Sepolia network switch
//
// Loaded with: <script src="/assets/awm-shell.js" type="module"></script>
// The page must include a <div id="awm-shell-slot"></div> somewhere; if not,
// we inject one before </body> automatically.

import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.7.0/dist/ethers.min.js';

const NETWORKS = {
  mainnet: { chainId: 8453, name: 'Base Mainnet', rpc: 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    escrow: '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2' },
  sepolia: { chainId: 84532, name: 'Base Sepolia', rpc: 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    escrow: '0x489C36738F46e395b4cd26DDf0f85756686A2f07' },
};

const STORE_KEY = 'awm_wallet';
const ACTIVE_NETWORK = 'mainnet';

let state = {
  provider: null,
  signer: null,
  address: null,
  chainId: null,
  usdcBalance: null,
};

// ---- Wallet connect ----
async function ensureInjected() {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('No Web3 wallet detected. Install MetaMask, Coinbase Wallet, or use a wallet that injects window.ethereum (e.g. Rabby, Frame, Brave).');
  }
  state.provider = new ethers.BrowserProvider(window.ethereum);
  return state.provider;
}

async function connect() {
  const provider = await ensureInjected();
  await provider.send('eth_requestAccounts', []);
  state.signer = await provider.getSigner();
  state.address = await state.signer.getAddress();
  const net = await provider.getNetwork();
  state.chainId = Number(net.chainId);
  localStorage.setItem(STORE_KEY, JSON.stringify({ address: state.address, chainId: state.chainId }));
  await refreshBalance();
  return { address: state.address, chainId: state.chainId };
}

async function disconnect() {
  state = { provider: null, signer: null, address: null, chainId: null, usdcBalance: null };
  localStorage.removeItem(STORE_KEY);
}

async function autoReconnect() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved.address) return;
    if (typeof window.ethereum === 'undefined') return;
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts && accounts.length && accounts[0].toLowerCase() === saved.address.toLowerCase()) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const net = await provider.getNetwork();
      state = { provider, signer, address, chainId: Number(net.chainId), usdcBalance: null };
      await refreshBalance();
    }
  } catch (_) { /* silent */ }
}

async function refreshBalance() {
  if (!state.signer || !state.address) return;
  try {
    const net = ACTIVE_NETWORK;
    const cfg = NETWORKS[net];
    const usdc = new ethers.Contract(cfg.usdc, ['function balanceOf(address) view returns (uint256)','function decimals() view returns (uint8)'], state.signer);
    const [bal, dec] = await Promise.all([usdc.balanceOf(state.address), usdc.decimals()]);
    state.usdcBalance = ethers.formatUnits(bal, dec);
  } catch (e) {
    state.usdcBalance = null;
  }
}

async function ensureBaseMainnet() {
  if (typeof window.ethereum === 'undefined') return;
  const target = NETWORKS[ACTIVE_NETWORK];
  const current = '0x' + NETWORKS[ACTIVE_NETWORK].chainId.toString(16);
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: current }] });
  } catch (switchErr) {
    if (switchErr.code === 4902 || /Unrecognized chain/i.test(switchErr.message || '')) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: current,
          chainName: target.name,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [target.rpc],
          blockExplorerUrls: [target.chainId === 8453 ? 'https://basescan.org' : 'https://sepolia-explorer.base.org'],
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

// ---- Modal UI ----
const MODAL_CSS = `
.awm-modal-back { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; }
.awm-modal { max-width: 460px; width: 100%; background: linear-gradient(145deg, #141711, #0e100c); border: 1px solid rgba(240,195,91,.32); border-radius: 20px; padding: 28px; box-shadow: 0 30px 90px rgba(0,0,0,.7); color: #f3efe3; font: 14px/1.5 system-ui, sans-serif; }
.awm-modal h2 { margin: 0 0 6px; font-size: 22px; }
.awm-modal p { color: #a9a28e; margin: 0 0 18px; }
.awm-modal .awm-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(0,0,0,.32); border-radius: 12px; margin-bottom: 8px; font-family: "Berkeley Mono", "IBM Plex Mono", monospace; font-size: 12px; }
.awm-modal .awm-row b { color: #f0c35b; font-weight: 600; }
.awm-modal .awm-err { background: rgba(255,107,95,.15); color: #ff8a80; padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 12px; font-family: "Berkeley Mono", "IBM Plex Mono", monospace; }
.awm-modal button { width: 100%; padding: 14px; background: #f0c35b; color: #161006; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 14px; margin-top: 8px; }
.awm-modal button.secondary { background: transparent; color: #a9a28e; border: 1px solid rgba(243,239,227,.2); }
.awm-modal button:hover { filter: brightness(1.05); }
.awm-modal .awm-x { position: absolute; top: 14px; right: 18px; background: none; color: #a9a28e; border: none; font-size: 22px; cursor: pointer; width: auto; margin: 0; padding: 0; }
.awm-connected { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(126,231,135,.14); color: #7ee787; border-radius: 999px; font: 700 11px/1.4 "Berkeley Mono", monospace; text-transform: uppercase; letter-spacing: .08em; }
`;

function showModal() {
  if (document.getElementById('awm-modal')) return;
  const style = document.createElement('style');
  style.textContent = MODAL_CSS;
  document.head.appendChild(style);

  const back = document.createElement('div');
  back.id = 'awm-modal';
  back.className = 'awm-modal-back';
  back.innerHTML = `
    <div class="awm-modal" role="dialog" aria-label="Connect wallet">
      <button class="awm-x" aria-label="Close">×</button>
      <h2>Connect Wallet</h2>
      <p>AI Work Market settles on Base Mainnet (chain id 8453) using USDC. The page will request a network switch if needed.</p>
      <div id="awm-modal-body"></div>
    </div>
  `;
  document.body.appendChild(back);
  back.querySelector('.awm-x').onclick = hideModal;
  back.addEventListener('click', (e) => { if (e.target === back) hideModal(); });
  renderModalBody();
}

function hideModal() {
  const el = document.getElementById('awm-modal');
  if (el) el.remove();
}

function renderModalBody() {
  const body = document.querySelector('#awm-modal .awm-modal');
  if (!body) return;
  const target = document.getElementById('awm-modal-body');
  if (state.address) {
    target.innerHTML = `
      <div class="awm-row"><span>Status</span><b style="color:#7ee787">Connected</b></div>
      <div class="awm-row"><span>Address</span><b>${state.address.slice(0,6)}…${state.address.slice(-4)}</b></div>
      <div class="awm-row"><span>Network</span><b>${state.chainId === 8453 ? 'Base Mainnet' : state.chainId === 84532 ? 'Base Sepolia' : 'Chain ' + state.chainId}</b></div>
      <div class="awm-row"><span>USDC</span><b>${state.usdcBalance != null ? Number(state.usdcBalance).toFixed(2) : '—'}</b></div>
      <button id="awm-disconnect" class="secondary">Disconnect</button>
    `;
    document.getElementById('awm-disconnect').onclick = async () => {
      await disconnect();
      hideModal();
      updateAllConnectButtons();
    };
  } else {
    target.innerHTML = `
      <div id="awm-err"></div>
      <div class="awm-row"><span>Chain</span><b>Base Mainnet (8453)</b></div>
      <div class="awm-row"><span>Settle token</span><b>USDC (0x8335…2913)</b></div>
      <div class="awm-row"><span>Escrow</span><b>0x8b49…Dae2</b></div>
      <button id="awm-connect">Connect</button>
    `;
    document.getElementById('awm-connect').onclick = async () => {
      const err = document.getElementById('awm-err');
      err.innerHTML = '';
      try {
        await connect();
        await ensureBaseMainnet();
        await refreshBalance();
        renderModalBody();
        updateAllConnectButtons();
      } catch (e) {
        err.innerHTML = `<div class="awm-err">${(e && e.message) || 'Failed to connect'}</div>`;
      }
    };
  }
}

function updateAllConnectButtons() {
  // Mark every "Connect Wallet" link/button on the page so the user
  // gets immediate visual feedback after connecting.
  for (const el of document.querySelectorAll('a, button')) {
    const txt = (el.textContent || '').trim();
    if (/^Connect Wallet$/i.test(txt)) {
      if (state.address) {
        el.textContent = `${state.address.slice(0,6)}…${state.address.slice(-4)}`;
        el.classList.add('awm-connected');
      } else {
        el.textContent = 'Connect Wallet';
        el.classList.remove('awm-connected');
      }
    }
  }
}

// Hijack every <a href="/connect"> so it opens the modal instead of navigating.
function wireConnectLinks() {
  for (const a of document.querySelectorAll('a[href="/connect"]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showModal();
    });
  }
}

// ---- Live system status bar ----
async function fetchStatus() {
  try {
    const r = await fetch('/api/system-status');
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

async function injectStatusBar() {
  const s = await fetchStatus();
  if (!s) return;
  const net = s.network || 'base-mainnet';
  const o = s.onchain || {};
  const intents = o.completedIntents != null ? o.completedIntents : '—';
  const feesRaw = o.accumulatedFeesRaw || '0';
  const feesUsdc = (Number(feesRaw) / 1e6).toFixed(6);
  const feePct = o.defaultFeePercent || '1.00';
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9998;background:rgba(11,13,10,.92);border-top:1px solid rgba(243,239,227,.16);padding:8px 18px;font:600 11px/1.4 "Berkeley Mono","IBM Plex Mono",monospace;color:#a9a28e;display:flex;gap:18px;align-items:center;justify-content:space-between;backdrop-filter:blur(8px);text-transform:uppercase;letter-spacing:.08em;';
  bar.innerHTML = `
    <span>${net} · ${feePct}% fee · <span style="color:#f0c35b">${intents}</span> intents · <span style="color:#7ee787">${feesUsdc} USDC</span> accrued</span>
    <span style="display:flex;gap:14px"><a href="/api/system-status" style="color:#7dd3fc;text-decoration:none">JSON</a><a href="/llm.txt" style="color:#7dd3fc;text-decoration:none">llm.txt</a><a href="/.well-known/openapi.json" style="color:#7dd3fc;text-decoration:none">OpenAPI</a></span>
  `;
  document.body.appendChild(bar);
  // Pad body so content isn't hidden under the bar
  document.body.style.paddingBottom = '40px';
}

// ---- Init ----
async function init() {
  wireConnectLinks();
  await autoReconnect();
  updateAllConnectButtons();
  // Status bar is opt-in per page (set <body data-awm-bar>)
  if (document.body && document.body.dataset && document.body.dataset.awmBar !== undefined) {
    await injectStatusBar();
  }
}

// Re-wire connect links after any DOM changes (e.g. SPAs)
const mo = new MutationObserver(() => wireConnectLinks());
mo.observe(document.body, { childList: true, subtree: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expose helpers
window.AWM = { connect, disconnect, ensureBaseMainnet, refreshBalance, showModal, get state() { return state; } };
