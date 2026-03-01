// ============================================================
//  ASI-DEX: RNode Client SDK
//  Wraps the ASI:Chain HTTP API (inherited from RChain RNode)
//
//  Two endpoints:
//    DEPLOY_URL  - POST /deploy  (state-changing txs, needs sig)
//    EXPLORE_URL - POST /explore-deploy  (read-only queries)
// ============================================================

const RNODE_CONFIG = {
  // DevNet observer node (read-only queries)
  EXPLORE_URL: "http://54.152.57.201:40453/explore-deploy",
  // DevNet validator (state-changing deploys)
  // In production use the wallet's signing flow instead of direct POST
  DEPLOY_URL:  "http://54.152.57.201:40453/deploy",
  // Registry lookup base
  REGISTRY_LOOKUP: "http://54.152.57.201:40453/api/registry",
};

// ---- Your deployed contract URIs (fill in after deploying) ----
export const CONTRACT_URIS = {
  TOKEN_A:  "rho:id:REPLACE_WITH_TOKEN_A_URI",
  TOKEN_B:  "rho:id:REPLACE_WITH_TOKEN_B_URI",
  FACTORY:  "rho:id:REPLACE_WITH_FACTORY_URI",
  ROUTER:   "rho:id:REPLACE_WITH_ROUTER_URI",
  PAIR_AB:  "rho:id:REPLACE_WITH_PAIR_URI",   // TokenA/TokenB pair
};

// ---- Token metadata (mirrors what's in Token.rho) ----
export const TOKEN_META = {
  [CONTRACT_URIS.TOKEN_A]: { name: "ASI-DEX Token A", symbol: "TKNA", decimals: 18 },
  [CONTRACT_URIS.TOKEN_B]: { name: "ASI-DEX Token B", symbol: "TKNB", decimals: 18 },
};

// ============================================================
//  Core HTTP helpers
// ============================================================

/**
 * explore-deploy: read-only Rholang evaluation (no signature needed)
 * Returns the evaluated term result.
 */
export async function exploreDeploy(rholangTerm) {
  const res = await fetch(RNODE_CONFIG.EXPLORE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ term: rholangTerm }),
  });
  if (!res.ok) throw new Error(`RNode HTTP error: ${res.status}`);
  const data = await res.json();
  // RNode returns { expr: [...], cost: {...} }
  if (data.expr && data.expr.length > 0) return data.expr[0];
  throw new Error("Empty response from RNode");
}

/**
 * Deploy a signed transaction via the wallet extension.
 * Uses window.fetchBrowserWallet to sign, then submits to RNode.
 */
export async function deployWithWallet(rholangTerm, phloLimit = 500000) {
  if (!window.fetchBrowserWallet) {
    throw new Error("ASI Alliance Wallet not installed");
  }
  const wallet = window.fetchBrowserWallet;

  // Get current account
  const accounts = await wallet.wallet.getAccounts?.() 
    || await wallet.keplr?.getOfflineSigner?.("asi-chain-devnet")?.getAccounts();
  if (!accounts || accounts.length === 0) throw new Error("No wallet account found");
  const address = accounts[0].address;

  // Build the deploy payload
  // Note: ASI:Chain uses RChain's deploy structure
  const deployData = {
    term: rholangTerm,
    timestamp: Date.now(),
    phloPrice: 1,
    phloLimit: phloLimit,
    validAfterBlockNumber: -1,
  };

  // Sign via wallet
  // The wallet signs the deploy hash; exact API may evolve with DevNet
  const signResult = await wallet.rholang?.signDeploy?.(deployData)
    || await wallet.keplr?.signArbitrary?.("asi-chain-devnet", address, JSON.stringify(deployData));

  if (!signResult) throw new Error("Signing failed or wallet does not support rholang signing yet");

  // Submit signed deploy
  const res = await fetch(RNODE_CONFIG.DEPLOY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...deployData, sig: signResult.signature, deployer: signResult.pub_key }),
  });
  if (!res.ok) throw new Error(`Deploy failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

// ============================================================
//  Wallet connection helpers
// ============================================================

export async function connectWallet() {
  if (!window.fetchBrowserWallet) {
    throw new Error("Please install the ASI Alliance Wallet browser extension");
  }
  // Request permission
  await window.fetchBrowserWallet.wallet.enable("asi-chain-devnet");
  const accounts = await window.fetchBrowserWallet.wallet.getAccounts?.()
    || [];
  if (accounts.length === 0) throw new Error("No accounts found in wallet");
  return accounts[0].address;
}

export function isWalletInstalled() {
  return typeof window.fetchBrowserWallet !== "undefined";
}

// ============================================================
//  Token contract calls
// ============================================================

export async function getTokenBalance(tokenUri, address) {
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${tokenUri}\`, *return) |
      for (token <- return) {
        new balCh in {
          token!("balanceOf", "${address}", *balCh) |
          for (@bal <- balCh) { return!(bal) }
        }
      }
    }
  `;
  const result = await exploreDeploy(term);
  return parseRholangInt(result);
}

export async function getTokenAllowance(tokenUri, owner, spender) {
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${tokenUri}\`, *return) |
      for (token <- return) {
        new allowCh in {
          token!("allowance", "${owner}", "${spender}", *allowCh) |
          for (@amt <- allowCh) { return!(amt) }
        }
      }
    }
  `;
  const result = await exploreDeploy(term);
  return parseRholangInt(result);
}

export async function approveToken(tokenUri, spender, amount) {
  const caller = await connectWallet();
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${tokenUri}\`, *return) |
      for (token <- return) {
        new approveCh in {
          token!("approve", "${caller}", "${spender}", ${amount}, *approveCh) |
          for (@res <- approveCh) { return!(res) }
        }
      }
    }
  `;
  return deployWithWallet(term);
}

// ============================================================
//  Pair contract calls (read-only)
// ============================================================

export async function getPairReserves(pairUri) {
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${pairUri}\`, *return) |
      for (pair <- return) {
        new resCh in {
          pair!("getReserves", *resCh) |
          for (@res <- resCh) { return!(res) }
        }
      }
    }
  `;
  const result = await exploreDeploy(term);
  return parseRholangTuple(result); // returns [reserveA, reserveB]
}

export async function getLPBalance(pairUri, address) {
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${pairUri}\`, *return) |
      for (pair <- return) {
        new balCh in {
          pair!("getLPBalance", "${address}", *balCh) |
          for (@bal <- balCh) { return!(bal) }
        }
      }
    }
  `;
  const result = await exploreDeploy(term);
  return parseRholangInt(result);
}

export async function getLPSupply(pairUri) {
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${pairUri}\`, *return) |
      for (pair <- return) {
        new supCh in {
          pair!("getLPSupply", *supCh) |
          for (@sup <- supCh) { return!(sup) }
        }
      }
    }
  `;
  const result = await exploreDeploy(term);
  return parseRholangInt(result);
}

// ============================================================
//  Router contract calls (state-changing via wallet)
// ============================================================

export async function getAmountOut(amountIn, tokenInUri, tokenOutUri) {
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${CONTRACT_URIS.ROUTER}\`, *return) |
      for (router <- return) {
        new calcCh in {
          router!("getAmountOut", ${amountIn}, "${tokenInUri}", "${tokenOutUri}", *calcCh) |
          for (@res <- calcCh) { return!(res) }
        }
      }
    }
  `;
  const result = await exploreDeploy(term);
  return parseRholangAmountOut(result); // { success, amount, message }
}

export async function swap(amountIn, minAmountOut, tokenInUri, tokenOutUri, recipientAddress) {
  const caller = await connectWallet();
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${CONTRACT_URIS.ROUTER}\`, *return) |
      for (router <- return) {
        new swapCh in {
          router!(
            "swapExactTokensForTokens",
            "${caller}", ${amountIn}, ${minAmountOut},
            "${tokenInUri}", "${tokenOutUri}",
            "${recipientAddress || caller}",
            *swapCh
          ) |
          for (@res <- swapCh) { return!(res) }
        }
      }
    }
  `;
  return deployWithWallet(term);
}

export async function addLiquidity(tokenAUri, tokenBUri, amtA, amtB, minLP) {
  const provider = await connectWallet();
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${CONTRACT_URIS.ROUTER}\`, *return) |
      for (router <- return) {
        new liqCh in {
          router!(
            "addLiquidity",
            "${provider}", "${tokenAUri}", "${tokenBUri}",
            ${amtA}, ${amtB}, ${minLP},
            *liqCh
          ) |
          for (@res <- liqCh) { return!(res) }
        }
      }
    }
  `;
  return deployWithWallet(term);
}

export async function removeLiquidity(tokenAUri, tokenBUri, lpAmount, minA, minB) {
  const provider = await connectWallet();
  const term = `
    new return, lookup(\`rho:registry:lookup\`) in {
      lookup!(\`${CONTRACT_URIS.ROUTER}\`, *return) |
      for (router <- return) {
        new remCh in {
          router!(
            "removeLiquidity",
            "${provider}", "${tokenAUri}", "${tokenBUri}",
            ${lpAmount}, ${minA}, ${minB},
            *remCh
          ) |
          for (@res <- remCh) { return!(res) }
        }
      }
    }
  `;
  return deployWithWallet(term);
}

// ============================================================
//  RNode response parsers
//  RNode returns Rholang AST as JSON; these extract JS values
// ============================================================

export function parseRholangInt(expr) {
  // expr looks like: { ExprInt: { data: 1234 } }
  if (expr?.ExprInt?.data !== undefined) return Number(expr.ExprInt.data);
  if (expr?.ExprBool?.data !== undefined) return expr.ExprBool.data;
  return 0;
}

export function parseRholangTuple(expr) {
  // Tuple: { ExprTuple: { ps: [...] } }
  if (expr?.ExprTuple?.ps) {
    return expr.ExprTuple.ps.map(parseRholangInt);
  }
  return [0, 0];
}

export function parseRholangAmountOut(expr) {
  // (bool, int, string) tuple
  if (expr?.ExprTuple?.ps) {
    const [ok, amount, msg] = expr.ExprTuple.ps;
    return {
      success: ok?.ExprBool?.data ?? false,
      amount:  amount?.ExprInt?.data ?? 0,
      message: msg?.ExprString?.data ?? "",
    };
  }
  return { success: false, amount: 0, message: "Parse error" };
}

// ============================================================
//  Unit conversion helpers (18 decimals)
// ============================================================

export function toWei(amount, decimals = 18) {
  return BigInt(Math.floor(parseFloat(amount) * 10 ** decimals)).toString();
}

export function fromWei(amount, decimals = 18) {
  if (!amount) return "0";
  const divisor = 10 ** decimals;
  return (Number(amount) / divisor).toFixed(6);
}

export function calculatePriceImpact(amountIn, reserveIn, reserveOut) {
  if (reserveIn === 0 || reserveOut === 0) return 0;
  const amountInWithFee = amountIn * 997;
  const amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
  const midPrice = reserveOut / reserveIn;
  const executionPrice = amountOut / amountIn;
  return Math.abs((midPrice - executionPrice) / midPrice) * 100;
}

export function calculateMinAmountOut(amountOut, slippagePct) {
  return Math.floor(amountOut * (1 - slippagePct / 100));
}
