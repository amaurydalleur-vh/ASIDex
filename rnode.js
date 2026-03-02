// ============================================================
//  ASI-DEX: RNode Client SDK (named-channel edition)
//  Compatible with ASIDexKernel.rho (no URI workflow).
//
//  Usage:
//    import { setNamespace, swap, addLiquidity, ... } from "./rnode.js";
//    setNamespace("dalleurv1");
// ============================================================

// ---- Config ----
const RNODE_CONFIG = {
  EXPLORE_URL: "http://54.152.57.201:40453/explore-deploy",
  DEPLOY_URL:  "http://54.152.57.201:40453/deploy",
  CHAIN_ID:    "asi-chain-devnet",
  IDE_URL:     "https://wallet.dev.asichain.io",
};

let NS = "dalleurv1"; // default; override with setNamespace()

export function setNamespace(ns) { NS = ns; }

// Derived channel names
const ch = () => ({
  tokenA: `@"asidex:tokenA:${NS}"`,
  tokenB: `@"asidex:tokenB:${NS}"`,
  pair:   `@"asidex:pair:${NS}"`,
  router: `@"asidex:router:${NS}"`,
  pairSpender: `asidex:pair:${NS}`,
});

// Admin key (public — hardcoded in deployed Rholang)
export const ADMIN_KEY = "ASIDEX_ADMIN_2026_Mc7vQ9rL2xP4nT8kW1sZ5dH3yB6uJ0fR";

// ============================================================
//  Core HTTP helpers
// ============================================================

export async function exploreDeploy(rholangTerm) {
  const res = await fetch(RNODE_CONFIG.EXPLORE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ term: rholangTerm }),
  });
  if (!res.ok) throw new Error(`RNode HTTP error: ${res.status}`);
  const data = await res.json();
  if (data.expr && data.expr.length > 0) return data.expr[0];
  throw new Error("Empty response from RNode");
}

export async function deployWithWallet(rholangTerm, phloLimit = 1_000_000) {
  const wbw = window.fetchBrowserWallet;
  if (!wbw) throw new Error("ASI Alliance Wallet not installed");

  await wbw.wallet.enable(RNODE_CONFIG.CHAIN_ID);
  const accounts = await wbw.wallet.getAccounts?.() ?? [];
  if (!accounts.length) throw new Error("No wallet account found");

  const signer = wbw.rholang?.signDeploy;
  if (!signer) {
    // Fallback: copy to clipboard and open IDE
    await navigator.clipboard.writeText(rholangTerm);
    window.open(RNODE_CONFIG.IDE_URL, "_blank", "noopener");
    throw new Error("Wallet deploy API unavailable. Rholang term copied — paste it in the wallet IDE.");
  }

  const payload = {
    term: rholangTerm,
    timestamp: Date.now(),
    phloPrice: 1,
    phloLimit,
    validAfterBlockNumber: -1,
  };
  const signed = await signer(payload);
  const res = await fetch(RNODE_CONFIG.DEPLOY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, sig: signed.signature, deployer: signed.pub_key }),
  });
  if (!res.ok) throw new Error(`Deploy failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function connectWallet() {
  const wbw = window.fetchBrowserWallet;
  if (!wbw) throw new Error("Please install the ASI Alliance Wallet browser extension");
  await wbw.wallet.enable(RNODE_CONFIG.CHAIN_ID);
  const accounts = await wbw.wallet.getAccounts?.() ?? [];
  if (!accounts.length) throw new Error("No accounts found");
  return accounts[0].address;
}

// ============================================================
//  Token reads (explore-deploy)
// ============================================================

export async function getTokenBalance(token, address) {
  // token: "A" or "B"
  const c = ch();
  const tokenCh = token === "A" ? c.tokenA : c.tokenB;
  const term = `
    new ret, b in {
      ${tokenCh}!("balanceOf", "${address}", *b) |
      for (@bal <- b) { ret!(bal) }
    }`;
  return parseRholangInt(await exploreDeploy(term));
}

export async function getTokenAllowance(token, owner, spender) {
  const c = ch();
  const tokenCh = token === "A" ? c.tokenA : c.tokenB;
  const term = `
    new ret, a in {
      ${tokenCh}!("allowance", "${owner}", "${spender}", *a) |
      for (@amt <- a) { ret!(amt) }
    }`;
  return parseRholangInt(await exploreDeploy(term));
}

export async function getPairReserves() {
  const c = ch();
  const term = `
    new ret, r in {
      ${c.pair}!("getReserves", *r) |
      for (@res <- r) { ret!(res) }
    }`;
  return parseRholangTuple(await exploreDeploy(term)); // [reserveA, reserveB]
}

export async function getLPBalance(address) {
  const c = ch();
  const term = `
    new ret, b in {
      ${c.pair}!("getLPBalance", "${address}", *b) |
      for (@bal <- b) { ret!(bal) }
    }`;
  return parseRholangInt(await exploreDeploy(term));
}

export async function getLPSupply() {
  const c = ch();
  const term = `
    new ret, s in {
      ${c.pair}!("getLPSupply", *s) |
      for (@sup <- s) { ret!(sup) }
    }`;
  return parseRholangInt(await exploreDeploy(term));
}

export async function getAmountOut(amountIn, tokenIn, tokenOut) {
  // tokenIn / tokenOut: "A" or "B"
  const c = ch();
  const term = `
    new ret, r in {
      ${c.router}!("getAmountOut", ${amountIn}, "${tokenIn}", "${tokenOut}", *r) |
      for (@res <- r) { ret!(res) }
    }`;
  return parseRholangAmountOut(await exploreDeploy(term));
}

export async function debugState() {
  const c = ch();
  const term = `
    new ret, r in {
      ${c.router}!("debugState", *r) |
      for (@res <- r) { ret!(res) }
    }`;
  const expr = await exploreDeploy(term);
  const ints = findExprInts(expr);
  return { supplyA: ints[0]||0, supplyB: ints[1]||0, reserveA: ints[2]||0, reserveB: ints[3]||0, lpSupply: ints[4]||0 };
}

// ============================================================
//  State-changing operations (wallet deploy)
// ============================================================

export async function approveToken(token, amount) {
  const caller = await connectWallet();
  const c = ch();
  const tokenCh = token === "A" ? c.tokenA : c.tokenB;
  const term = `
    new ret, a in {
      ${tokenCh}!("approve", "${caller}", "${c.pairSpender}", ${amount}, *a) |
      for (@res <- a) { ret!(res) }
    }`;
  return deployWithWallet(term);
}

export async function mintToken(token, toAddress, amount) {
  const c = ch();
  const tokenCh = token === "A" ? c.tokenA : c.tokenB;
  const term = `
    new ret, adminKeyCh, mintCh in {
      adminKeyCh!("${ADMIN_KEY}") |
      ${tokenCh}!("mint", "${toAddress}", ${amount}, *adminKeyCh, *mintCh) |
      for (@res <- mintCh) { ret!(res) }
    }`;
  return deployWithWallet(term);
}

export async function swap(amountIn, minAmountOut, tokenIn, tokenOut, recipientAddress) {
  // tokenIn / tokenOut: "A" or "B"
  const caller = await connectWallet();
  const c = ch();
  const to = recipientAddress || caller;

  // Step 1: approve
  const tokenCh = tokenIn === "A" ? c.tokenA : c.tokenB;
  const approveTerm = `
    new ret, a in {
      ${tokenCh}!("approve", "${caller}", "${c.pairSpender}", ${amountIn}, *a) |
      for (@res <- a) { ret!(res) }
    }`;
  await deployWithWallet(approveTerm);

  // Step 2: swap
  const swapTerm = `
    new ret, s in {
      ${c.router}!("swapExactTokensForTokens",
        "${caller}", ${amountIn}, ${minAmountOut},
        "${tokenIn}", "${tokenOut}", "${to}", *s
      ) |
      for (@res <- s) { ret!(res) }
    }`;
  return deployWithWallet(swapTerm);
}

export async function addLiquidity(amtA, amtB, minLP = 0) {
  const provider = await connectWallet();
  const c = ch();

  // Approve both tokens
  const approveATerm = `
    new ret, a in {
      ${c.tokenA}!("approve", "${provider}", "${c.pairSpender}", ${amtA}, *a) |
      for (@res <- a) { ret!(res) }
    }`;
  const approveBTerm = `
    new ret, a in {
      ${c.tokenB}!("approve", "${provider}", "${c.pairSpender}", ${amtB}, *a) |
      for (@res <- a) { ret!(res) }
    }`;
  const addTerm = `
    new ret, a in {
      ${c.router}!("addLiquidity", "${provider}", ${amtA}, ${amtB}, ${minLP}, *a) |
      for (@res <- a) { ret!(res) }
    }`;

  await deployWithWallet(approveATerm);
  await deployWithWallet(approveBTerm);
  return deployWithWallet(addTerm);
}

export async function removeLiquidity(lpAmount, minA = 0, minB = 0) {
  const provider = await connectWallet();
  const c = ch();
  const term = `
    new ret, a in {
      ${c.router}!("removeLiquidity", "${provider}", ${lpAmount}, ${minA}, ${minB}, *a) |
      for (@res <- a) { ret!(res) }
    }`;
  return deployWithWallet(term);
}

// ============================================================
//  RNode response parsers
// ============================================================

export function parseRholangInt(expr) {
  if (expr?.ExprInt?.data  !== undefined) return Number(expr.ExprInt.data);
  if (expr?.ExprBool?.data !== undefined) return expr.ExprBool.data ? 1 : 0;
  return 0;
}

export function parseRholangTuple(expr) {
  if (expr?.ExprTuple?.ps) return expr.ExprTuple.ps.map(parseRholangInt);
  return [0, 0];
}

export function parseRholangAmountOut(expr) {
  if (expr?.ExprTuple?.ps) {
    const [ok, amount, msg] = expr.ExprTuple.ps;
    return {
      success: ok?.ExprBool?.data  ?? false,
      amount:  amount?.ExprInt?.data ?? 0,
      message: msg?.ExprString?.data ?? "",
    };
  }
  return { success: false, amount: 0, message: "Parse error" };
}

function findExprInts(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.ExprInt?.data != null) out.push(Number(node.ExprInt.data));
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach(x => findExprInts(x, out));
    else if (v && typeof v === "object") findExprInts(v, out);
  }
  return out;
}

// ============================================================
//  Unit conversion helpers
// ============================================================

export function toWei(amount, decimals = 18) {
  const s = String(amount).trim();
  const [wholeRaw = "0", fracRaw = ""] = s.split(".");
  const frac = fracRaw.padEnd(decimals, "0").slice(0, decimals);
  return (BigInt(wholeRaw || "0") * (10n ** BigInt(decimals)) + BigInt(frac || "0")).toString();
}

export function fromWei(amount, decimals = 18) {
  if (!amount) return "0.000000";
  const bi    = BigInt(String(amount));
  const base  = 10n ** BigInt(decimals);
  const whole = bi / base;
  const frac  = (bi % base).toString().padStart(decimals, "0").slice(0, 6);
  return `${whole}.${frac}`;
}

export function calculatePriceImpact(amountIn, reserveIn, reserveOut) {
  if (!reserveIn || !reserveOut) return 0;
  const fee   = Number(amountIn) * 997;
  const out   = (fee * Number(reserveOut)) / (Number(reserveIn) * 1000 + fee);
  const mid   = Number(reserveOut) / Number(reserveIn);
  const exec  = out / Number(amountIn);
  return Math.abs((mid - exec) / mid) * 100;
}

export function calculateMinAmountOut(amountOut, slippagePct) {
  return Math.floor(Number(amountOut) * (1 - slippagePct / 100));
}
