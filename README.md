# ASIDex (ASI Chain Devnet)
Simple Uniswap V2-style DEX PoC for ASI Chain Devnet.

## Included
- `Token.rho`: ERC20-like token
- `Pair.rho`: AMM pair (x*y=k, LP mint/burn)
- `Factory.rho`: pair registry
- `Router.rho`: swap/liquidity entrypoint
- `index.html`: browser UI (no build step)
- `DEPLOY.md`: deployment flow

## Run UI
1. Open `index.html` in browser.
2. Connect ASI Alliance Wallet.
3. If contract URIs are not configured, accept the prompt and paste:
   - `TOKEN_A`, `TOKEN_B`, `FACTORY`, `ROUTER`, `PAIR_AB`
4. Use Swap / Liquidity / Pool tabs.

## Notes
- Reads use `explore-deploy` on Devnet observer.
- Writes try wallet deploy API first.
- If wallet deploy API is unavailable, UI copies the Rholang deploy term and opens wallet IDE so you can paste and deploy manually.
- Current `Pair.rho` expects self-allowance pattern for `transferFrom` in this PoC; UI auto-submits needed approvals before swap/add-liquidity.
