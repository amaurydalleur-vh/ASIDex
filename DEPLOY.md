# ASI-DEX Deployment Guide
## Quickstart — Single Kernel File, No URIs

This is the only workflow needed. One deploy, one namespace, done.

---

## Prerequisites

1. **ASI Alliance Wallet** browser extension
   - Chrome: https://chromewebstore.google.com/detail/asi-alliance-wallet/ellkdbaphhldpeajbepobaecooaoafpg
2. **DevNet test FETCH** from the faucet: https://faucet.dev.asichain.io
3. **Wallet IDE**: https://wallet.dev.asichain.io

---

## Step 1 — Deploy the Kernel

1. Open `ASIDexKernel.rho`
2. The namespace is already set to `dalleurv1`. If you want your own, replace every
   occurrence of `dalleurv1` with your slug (e.g. `yourname-v1`).
3. Open the Wallet IDE → Smart Contracts tab
4. Paste the full contents of `ASIDexKernel.rho`
5. Set Phlo limit: **2,000,000**
6. Click **Deploy**

This deploys four contracts simultaneously:
- `@"asidex:tokenA:dalleurv1"` — ERC-20 style token A (TKNA)
- `@"asidex:tokenB:dalleurv1"` — ERC-20 style token B (TKNB)
- `@"asidex:pair:dalleurv1"`   — AMM pool (x·y = k, 0.3% fee)
- `@"asidex:router:dalleurv1"` — User-facing entry point

---

## Step 2 — Open the UI

1. Open `index.html` in a browser that has the ASI Alliance Wallet extension
2. The namespace defaults to `dalleurv1`. If you used a different slug in Step 1,
   click **Configure Namespace** and enter your slug.
3. Click **Connect Wallet**

---

## Step 3 — Mint Test Tokens

1. Click the **Dev Faucet** tab in the UI
2. Enter amounts for TKNA and TKNB (e.g. `10000`)
3. Click **Mint TKNA** then **Mint TKNB**

Each mint is a separate blockchain transaction.

If the wallet doesn't support programmatic signing yet, the Rholang term is
automatically copied to your clipboard and the IDE opens — just paste and deploy.

**Manual mint (wallet IDE):**
```rholang
new ret, adminKeyCh, mintCh in {
  adminKeyCh!("ASIDEX_ADMIN_2026_Mc7vQ9rL2xP4nT8kW1sZ5dH3yB6uJ0fR") |
  @"asidex:tokenA:dalleurv1"!("mint", "YOUR_WALLET_ADDRESS", 10000000000000000000000, *adminKeyCh, *mintCh) |
  for (@res <- mintCh) { ret!(res) }
}
```
Run the same replacing `tokenA` with `tokenB` for TKNB.

---

## Step 4 — Add Initial Liquidity

1. Click the **Liquidity** tab → **Add Liquidity**
2. Enter Token A amount (Token B is auto-calculated once there is an existing ratio)
3. Click **Add Liquidity & Mint LP Tokens**

This sends three transactions: approve TKNA, approve TKNB, then addLiquidity.
Each requires wallet signature.

---

## Step 5 — Swap

1. Click the **Swap** tab
2. Enter an amount, choose direction
3. Click **Swap**

This sends two transactions: approve token in, then swap.

---

## Verifying Deployment

In the **Dev Faucet** tab, click **Query debugState** to read:
- `supplyA` / `supplyB` — total minted supply
- `reserveA` / `reserveB` — AMM pool reserves
- `lpSupply` — total LP tokens minted

Or directly in the wallet IDE:
```rholang
new ret, r in {
  @"asidex:router:dalleurv1"!("debugState", *r) |
  for (@res <- r) { ret!(res) }
}
```

---

## Architecture

```
ASIDexKernel.rho  (single deploy)
  ├── tokenA  @"asidex:tokenA:dalleurv1"   ← ERC-20 style (mint/transfer/approve/transferFrom)
  ├── tokenB  @"asidex:tokenB:dalleurv1"   ← same
  ├── pair    @"asidex:pair:dalleurv1"      ← AMM (addLiquidity/removeLiquidity/swap)
  └── router  @"asidex:router:dalleurv1"   ← entry point + debugState

index.html   ← standalone UI (no bundler), uses inline SDK
rnode.js     ← external SDK (import { swap, addLiquidity, ... } from "./rnode.js")
```

---

## Known Limitations (DevNet)

| Limitation | Notes |
|---|---|
| Wallet signing API | `rholang.signDeploy` may not exist yet; UI auto-falls back to clipboard + IDE paste |
| Integer math only | All amounts use 18-decimal integer representation (wei-style) |
| No multi-hop routing | Direct pairs only (A → B via A→B pair, no A→C via B) |
| No FETCH/native token pair | Only ERC-20 style internal tokens |
| Security model | Token `transfer` uses caller string — no cryptographic proof of identity on DevNet |
| `amaury-v1` namespace | Old deployment — missing `removeLiquidity`, do NOT use |

---

## Admin Key

The admin key for minting is embedded in the deployed contract and is therefore public:

```
ASIDEX_ADMIN_2026_Mc7vQ9rL2xP4nT8kW1sZ5dH3yB6uJ0fR
```

For a production deployment you would rotate this to a fresh secret.

---

## Channel Reference

| Channel | Methods |
|---|---|
| `@"asidex:tokenA:dalleurv1"` | `name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`, `allowance`, `approve`, `transfer`, `transferFrom`, `mint` |
| `@"asidex:tokenB:dalleurv1"` | same as tokenA |
| `@"asidex:pair:dalleurv1"` | `getPoolSpender`, `getReserves`, `getLPSupply`, `getLPBalance`, `getAmountOut`, `addLiquidity`, `removeLiquidity`, `swap` |
| `@"asidex:router:dalleurv1"` | `getAmountOut`, `swapExactTokensForTokens`, `addLiquidity`, `removeLiquidity`, `debugState` |
