# ASI-DEX Deployment Guide
## Full V2-style DEX on ASI:Chain DevNet

---

## Architecture Overview

```
Token.rho (x2)  →  Pair.rho  →  Factory.rho  →  Router.rho
                                                        ↑
                               UI (index.html + rnode.js)
```

Each contract is deployed independently and registered in
the RChain on-chain registry. Contracts reference each other
via **registry URIs** (rho:id:...) rather than addresses.

---

## Prerequisites

1. Install **ASI Alliance Wallet** browser extension
   - Chrome: https://chromewebstore.google.com/detail/asi-alliance-wallet/ellkdbaphhldpeajbepobaecooaoafpg

2. Get DevNet test tokens from the faucet:
   - https://faucet.dev.asichain.io

3. Open the ASI Chain Wallet IDE:
   - https://wallet.dev.asichain.io

---

## Step 1 — Deploy Token A

1. Open wallet.dev.asichain.io → Smart Contracts tab
2. Paste the contents of `contracts/Token.rho`
3. **Before deploying**, edit these lines:
   ```
   contract tokenContract(@"name", return)   = { return!("ASI-DEX Token A") }
   contract tokenContract(@"symbol", return) = { return!("TKNA") }
   ```
   Change `"CHANGE_ME_SECRET_ADMIN_KEY"` to a secret string you'll remember.
4. Set Phlo limit: **500,000**
5. Click Deploy
6. In the console output, find: `["Token deployed at URI:", "rho:id:XXXX..."]`
7. **Save this URI** → this is `TOKEN_A_URI`

---

## Step 2 — Deploy Token B

Repeat Step 1 with different metadata:
- name: `"ASI-DEX Token B"`
- symbol: `"TKNB"`
- Same or different admin key

**Save the URI** → `TOKEN_B_URI`

---

## Step 3 — Mint Initial Tokens (for testing)

To mint tokens to your wallet address, run this in the wallet IDE
(replace values as needed):

```rholang
new return, lookup(`rho:registry:lookup`) in {
  lookup!(`TOKEN_A_URI_HERE`, *return) |
  for (token <- return) {
    new mintCh, adminKeyCh in {
      adminKeyCh!("YOUR_ADMIN_KEY") |
      token!("mint", "YOUR_WALLET_ADDRESS", 1000000000000000000000, *adminKeyCh, *mintCh) |
      for (@res <- mintCh) { return!(res) }
    }
  }
}
```

Run the same for Token B.

---

## Step 4 — Deploy Pair Contract

1. Open `contracts/Pair.rho`
2. Replace ALL occurrences of `TOKEN_A_URI` with your actual Token A URI
3. Replace ALL occurrences of `TOKEN_B_URI` with your actual Token B URI
4. Replace `PAIR_POOL_ADDR` with your wallet address (the pool "holds" tokens
   via the transfer mechanism; for DevNet this is a simplification — 
   in production use a contract-owned address)
5. Deploy with Phlo limit: **1,000,000**
6. **Save the URI** → `PAIR_URI`

---

## Step 5 — Deploy Factory Contract

1. Open `contracts/Factory.rho`
2. Replace `"FACTORY_ADMIN_SECRET"` with your admin key
3. Deploy with Phlo limit: **500,000**
4. **Save the URI** → `FACTORY_URI`

---

## Step 6 — Register the Pair in Factory

Run this in the wallet IDE:

```rholang
new return, lookup(`rho:registry:lookup`) in {
  lookup!(`FACTORY_URI_HERE`, *return) |
  for (factory <- return) {
    new regCh, adminKeyCh in {
      adminKeyCh!("FACTORY_ADMIN_SECRET") |
      factory!(
        "registerPair",
        "TOKEN_A_URI_HERE",
        "TOKEN_B_URI_HERE",
        "PAIR_URI_HERE",
        *adminKeyCh,
        *regCh
      ) |
      for (@res <- regCh) { return!(res) }
    }
  }
}
```

Expected response: `(true, "Pair registered", "PAIR_URI")`

---

## Step 7 — Deploy Router Contract

1. Open `contracts/Router.rho`
2. Replace `FACTORY_URI` with your actual Factory URI
3. Deploy with Phlo limit: **500,000**
4. **Save the URI** → `ROUTER_URI`

---

## Step 8 — Approve Tokens for the Pair Contract

Before adding liquidity or swapping, approve the Pair contract
to spend your tokens:

```rholang
new return, lookup(`rho:registry:lookup`) in {
  lookup!(`TOKEN_A_URI_HERE`, *return) |
  for (tokenA <- return) {
    new approveCh in {
      tokenA!(
        "approve",
        "YOUR_WALLET_ADDRESS",
        "PAIR_URI_HERE",          // spender = the pair contract's pool address
        1000000000000000000000,   // approve large amount
        *approveCh
      ) |
      for (@res <- approveCh) { return!(res) }
    }
  }
}
```

Repeat for Token B.

---

## Step 9 — Wire Up the UI

1. Open `ui/src/rnode.js`
2. Fill in the `CONTRACT_URIS` object:
   ```js
   export const CONTRACT_URIS = {
     TOKEN_A: "rho:id:YOUR_TOKEN_A_URI",
     TOKEN_B: "rho:id:YOUR_TOKEN_B_URI",
     FACTORY: "rho:id:YOUR_FACTORY_URI",
     ROUTER:  "rho:id:YOUR_ROUTER_URI",
     PAIR_AB: "rho:id:YOUR_PAIR_URI",
   };
   ```

3. Open `ui/index.html`
4. Fill in the `URIS` object at the top of the `<script>` block
5. Remove the mock data in `fetchPoolData()` and uncomment the
   real `explore()` call

6. Open `index.html` in a browser that has the ASI Alliance Wallet
   extension installed.

---

## Step 10 — Add Initial Liquidity

Via the UI:
1. Connect wallet
2. Go to Liquidity → Add Liquidity
3. Enter amounts for TKNA and TKNB
4. Click "Add Liquidity & Mint LP Tokens"

Or directly via wallet IDE:
```rholang
new return, lookup(`rho:registry:lookup`) in {
  lookup!(`ROUTER_URI_HERE`, *return) |
  for (router <- return) {
    new liqCh in {
      router!(
        "addLiquidity",
        "YOUR_WALLET_ADDRESS",
        "TOKEN_A_URI_HERE",
        "TOKEN_B_URI_HERE",
        50000000000000000000000,   // 50,000 TKNA
        125000000000000000000000,  // 125,000 TKNB (sets initial price 1:2.5)
        0,                          // minLP = 0 for first deposit
        *liqCh
      ) |
      for (@res <- liqCh) { return!(res) }
    }
  }
}
```

---

## Verifying Deployment

Query pool state at any time:

```rholang
// Check reserves
new return, lookup(`rho:registry:lookup`) in {
  lookup!(`PAIR_URI_HERE`, *return) |
  for (pair <- return) {
    new resCh in {
      pair!("getReserves", *resCh) |
      for (@res <- resCh) { return!(res) }
    }
  }
}
```

---

## Known Limitations (DevNet)

| Limitation | Notes |
|-----------|-------|
| No CREATE opcode | Pairs must be pre-deployed and registered manually |
| Wallet signing API | `rholang.signDeploy` may not exist yet; state-changing txs currently require manual paste into wallet IDE |
| Integer math only | All amounts use 18-decimal integer representation (wei-style) |
| No multi-hop routing | Router only supports direct pairs (no A→C via A→B→C) |
| MeTTa not yet in IDE | Wallet IDE currently Rholang only; MeTTa coming soon |

---

## Contract URIs to Record

| Contract | URI | Notes |
|----------|-----|-------|
| Token A  | `rho:id:...` | |
| Token B  | `rho:id:...` | |
| Pair A/B | `rho:id:...` | |
| Factory  | `rho:id:...` | |
| Router   | `rho:id:...` | |

---

## File Structure

```
asi-dex/
├── contracts/
│   ├── Token.rho      ← ERC-20 equivalent fungible token
│   ├── Pair.rho       ← AMM pool (x*y=k), LP tokens
│   ├── Factory.rho    ← Pair registry
│   └── Router.rho     ← User-facing swap/liquidity entry point
├── ui/
│   ├── index.html     ← Full DEX UI (standalone, no bundler needed)
│   └── src/
│       └── rnode.js   ← RNode HTTP client SDK
└── DEPLOY.md          ← This file
```
