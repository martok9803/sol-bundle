# Solana Multi-Wallet Trader (Pump.fun + Jupiter)

Developed by **martok9803**

---

## Overview

**Solana Multi-Wallet Trader** is a fast and minimalistic CLI application for automated multi-wallet trading on **Solana**.  
It’s designed to handle **Pump.fun** token launches and **Jupiter** swaps seamlessly, automatically detecting which route to use for each trade.  

The script operates entirely **locally** — it derives and signs all transactions on your machine using a single mnemonic seed phrase.  
No browser extensions, no third-party servers, and no external key handling.

---

## ✳️ Features

- 🔑 **Deterministic Wallet Generation** — derive up to **20 sub-wallets** from a single 12-word mnemonic.  
- 💰 **Funding Tools**
  - Equal split from main (keep a reserve and distribute the rest).  
  - Fixed SOL per wallet or range.  
  - One-off manual transfer.  
  - Sweep SOL back to main (keeping a configurable fee buffer).  
  - Hidden function: send SOL from main → external wallet.  
- ⚔️ **Trading Automation**
  - Buy across **all** wallets (fixed or “max” spend).  
  - Buy across **selected** wallets (same, custom, or “max”).  
  - Sell a **percentage** per wallet.  
  - Sell **100%** from all sub-wallets.  
  - Auto-detect Pump.fun bonding curve or fall back to Jupiter.  
- 🚀 **Submission Flexibility**
  - Integrates **Jito bundling** with optional tip support.  
  - Gracefully falls back to standard RPC when Jito is unavailable.  
- 🧱 **Failsafe Design**
  - Local-only mnemonic and signing.  
  - Rate limiting to respect RPC quotas.  
  - Configurable transaction speed and fee buffers.

---

## 🧠 How It Works

1. **Wallet Derivation**  
   Reads your mnemonic from `.env` and derives multiple Solana keypairs using BIP44 (`m/44'/501'/i'/0'`).  
   - Index 0 → Main wallet  
   - Indices 1–20 → Sub-wallets  

2. **Routing Logic**  
   - If the token’s Pump.fun bonding curve PDA is live → executes Pump.fun instructions directly.  
   - If not → uses Jupiter’s REST API to build and sign a routed swap.  

3. **Transaction Sending**  
   - If Jito is configured, bundles up to 4 txs with an optional tip.  
   - If Jito fails, automatically switches to standard RPC with throttling.

4. **Signing & Safety**  
   - All transactions are signed locally — the mnemonic never leaves your system.  
   - Optional micro-tipping via Jito to increase inclusion priority.

---

## ⚙️ Configuration (`.env`)

```bash
MNEMONIC="your twelve seed words here"

# RPC (Helius recommended)
RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
WS_URL="wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY"

# Jito (optional)
JITO_URL="ny.mainnet.block-engine.jito.wtf"
TIP_LAMPORTS=1000000              # 0.001 SOL tip, set to 0 to disable

# Bot Defaults
NUM_SUB_WALLETS=20
SLIPPAGE_BPS=100                  # 1%
FEE_BUFFER_SOL=0.003
MIN_SPEND_SOL=0.0005
SEND_TXS_PER_SEC=1                # 1 for free RPC, up to 5 for paid

# Routing Preferences
USE_PUMPFUN_FIRST=1               # 1 = try Pump.fun first
FORCE_RPC=0                       # 1 = skip Jito completely

# Hidden Transfer (Main → External)
EXTERNAL_WALLET="your_main_wallet_here"
EXTERNAL_FEE_RESERVE_SOL=0.0005

    🔒 Keep .env private and never commit it to GitHub.

🚀 Usage
1. Installation

git clone git@github.com:martok9803/sol-bundle.git
cd sol-bundle
npm install
cp .env.example .env
# Edit .env with your mnemonic and RPC keys

2. Start the CLI

npm start

3. Choose an Option

Once started, the script shows an interactive menu:

A) Set number of sub-wallets (1–20)
B) Show balances
C) FUND — Equal split from MAIN
D) FUND — Fixed amount per SELECTED wallets
E) FUND — Single wallet transfer
F) FUND — Sweep back to MAIN
G) SELL — Percentage by wallet (auto Pump/Jup)
H) BUY  — ALL wallets (auto Pump/Jup)
I) BUY  — SELECTED wallets (auto Pump/Jup)
J)
K) SELL — ALL wallets (100%) (auto Pump/Jup)
Q) Exit

    G / K → Sell

    H / I → Buy

    J → Hidden main → external transfer

🪙 Example Workflows
➤ Fund Wallets

    Equal split: keep a reserve (e.g., 0.1 SOL) and distribute the rest evenly.

    Fixed amount: send a specific amount to selected wallets (1-10,13,14).

    Sweep back: pull remaining SOL from sub-wallets back to main.

➤ Buy Tokens

    Buy from all or selected wallets.

    Use fixed or “max” mode.

    Automatically routes between Pump.fun and Jupiter.

➤ Sell Tokens

    Sell a percentage (e.g. 25%) from selected wallets.

    Or sell 100% from all sub-wallets instantly.

⚡ Performance Tips

    Free RPC → SEND_TXS_PER_SEC=1

    Paid RPC (Helius $49) → up to 3–5 tx/s safely

    Jito → set a small tip (0.0005–0.001 SOL) for better inclusion

    New tokens → if you see AccountNotInitialized (3012), wait a few blocks; the Pump.fun global PDA may not be ready yet.

🔍 Troubleshooting

TokenOwnerOffCurveError
→ Usually appears during ATA creation for new tokens. Retry once.

AccountNotInitialized (3012)
→ Pump.fun bonding curve not initialized yet. Wait or use Jupiter route.

Failed to get tip accounts / DNS
→ Jito endpoint flaky. Set FORCE_RPC=1 to bypass.

Simulation failed
→ Slippage or liquidity too low. Increase SLIPPAGE_BPS slightly.

Nothing to send
→ Transaction skipped because spend < MIN_SPEND_SOL or route missing.
🧩 Recommended Setup
Use Case	RPC	TX/s	Notes
Testing	Helius Free	1	Slower but stable
Active trading	Helius $49	3–5	Reliable & consistent
Sniping	Helius + Jito	3–5	Add 0.0005–0.001 SOL tip
🛡️ Safety Guidelines

    All signing and derivation happen locally.

    Keep mnemonic and .env file offline/backed up.

    Do not share screenshots of private keys.

    Avoid running multiple instances on the same mnemonic simultaneously.

    Double-check mint addresses before buying.

    Always test small first.

🗺️ Roadmap

    Trade logging (CSV/JSON export)

    Randomized send delay (10–60s)

    Local PnL summaries

    Optional dashboard (read-only)

    Configurable routing rules per token

📜 License

MIT License
Copyright (c) 2025 martok9803

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
