# ASIDex (ASI Chain Devnet)
Simple Uniswap V2-style DEX PoC for ASI Chain Devnet.

## Recommended path (no URI workflow)
- Deploy **one file**: `ASIDexKernel.rho`
- Configure only one value in UI: `NAMESPACE`
- Public channels:
  - `@"asidex:tokenA:<namespace>"`
  - `@"asidex:tokenB:<namespace>"`
  - `@"asidex:pair:<namespace>"`
  - `@"asidex:router:<namespace>"`

## Included
- `ASIDexKernel.rho`: single deploy kernel (tokens + pair + router)
- `index.html`: browser UI (no build step), namespace-based glue layer
- Legacy split contracts: `Token.rho`, `Pair.rho`, `Factory.rho`, `Router.rho`
- `DEPLOY.md`: deployment notes

## Run UI
1. Deploy `ASIDexKernel.rho` (replace `ASIDEX_NS` first).
2. Open `index.html` in browser.
3. Connect ASI wallet.
4. Click `Configure Namespace` and enter the same namespace.
5. Use Swap / Liquidity / Pool tabs.

## Notes
- Reads use `explore-deploy`.
- Writes try wallet deploy API first.
- If wallet deploy API is unavailable, UI copies Rholang term and opens wallet IDE for manual paste/deploy.
