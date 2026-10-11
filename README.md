# MEXC Futures Signal Scanner PWA — Prototype v0.1

## What it does
- Mobile-first installable web app UI.
- Fetches public MEXC Futures ticker data.
- Ranks USDT contracts by available 24h turnover field and scans up to 100.
- Fetches 5m, 15m, and 1h candles and applies a transparent rule-based signal filter.
- Displays LONG / SHORT / NO TRADE, indicative entry, stop, TP1 and TP2.
- Local signal logging and CSV export.
- No login, private API key, or order-placement capability.

## Important status
This is a prototype, not a validated profitable trading system. The exchange API response format and browser CORS behavior may change or vary. Verify the public API response against current official MEXC Futures documentation before relying on it. Missing contracts are skipped. Some fields and scoring rules are heuristic.

## Run it
1. Unzip the folder.
2. Serve the folder over HTTP/HTTPS; don't open index.html as a file.
   - If Python is installed on a computer: `python -m http.server 8000`
   - Then open `http://localhost:8000`
3. For Android use, deploy the folder to a static HTTPS host you control, then open the URL in your browser and use "Add to Home screen" if supported.
4. Tap "Scan top contracts" or enter a symbol like `BTC_USDT`.

## Limitations / next steps
- Android Chrome does not support ordinary desktop Chrome extensions; this is a PWA approach.
- Top-100 scanning sends multiple public API requests and may be slow or rate-limited.
- No true historical backtest engine is included yet; the log is a signal journal, not backtest proof.
- Fees, slippage, funding, spread, partial fills, and exchange-specific order rules are not yet included in reported levels.
- No trade execution is implemented by design.
- Do not use signals with real funds until the API data is verified and an out-of-sample backtest plus paper-trading period has been completed.
