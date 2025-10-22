# ⚡ Solana Multi-Wallet Trader (Pump.fun + Jupiter)

**Developed by [martok9803](https://github.com/martok9803)**  

---

## 🧩 Overview

**Solana Multi-Wallet Trader** is a fast and minimalistic CLI tool for automated multi-wallet trading on **Solana**.  
It seamlessly handles **Pump.fun** token launches and **Jupiter** swaps, automatically detecting the optimal route for each trade.

All operations happen **locally** — the app derives and signs every transaction on your machine using a single mnemonic seed phrase.  
No browser extensions. No third-party servers. No external key handling.

---

## ✳️ Features

### 🔑 Deterministic Wallet Generation
- Derive up to **20 sub-wallets** from a single 12-word mnemonic.

### 💰 Funding Tools
- Equal split from main wallet (keep a reserve and distribute the rest).  
- Fixed SOL per wallet or wallet range.  
- One-off manual transfers.  
- Sweep SOL back to main (configurable fee buffer).  
- Hidden transfer: main → external wallet.

### ⚔️ Trading Automation
- Buy or sell across **all** or **selected** wallets.  
- Choose **fixed**, **custom**, or **max** spend mode.  
- Sell a percentage or full balance per wallet.  
- Auto-detects **Pump.fun** bonding curve or falls back to **Jupiter**.

### 🚀 Submission Flexibility
- Integrates **Jito bundling** with optional tip support.  
- Gracefully falls back to standard RPC if Jito is unavailable.

### 🧱 Failsafe Design
- Local-only mnemonic and signing.  
- Adjustable rate limiting (respects RPC quotas).  
- Configurable transaction speed, slippage, and fee buffers.

---

## 🧠 How It Works

1. **Wallet Derivation**  
   Reads your mnemonic from `.env` and derives multiple Solana keypairs using BIP-44 (`m/44'/501'/i'/0'`).  
   - Index `0` → Main wallet  
   - Indices `1–20` → Sub-wallets  

2. **Routing Logic**  
   - If Pump.fun bonding curve PDA is live → executes Pump.fun instructions directly.  
   - Otherwise → uses Jupiter REST API to build and sign a routed swap.  

3. **Transaction Sending**  
   - If Jito is configured, bundles up to 4 transactions with optional tips.  
   - Automatically falls back to standard RPC with throttling if needed.  

4. **Signing & Safety**  
   - All signing happens locally — your mnemonic never leaves your machine.  
   - Optional micro-tips improve transaction inclusion via Jito.  

---

## ⚙️ Configuration (`.env`)

Below is a sample `.env` file.  
You can copy it from `.env.example` and modify it with your keys and wallet info.

---

```bash
# --- WALLET CONFIG ---
MNEMONIC="your twelve seed words here"

# --- RPC (Helius recommended) ---
RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
WS_URL="wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY"

# --- JITO (optional) ---
JITO_URL="ny.mainnet.block-engine.jito.wtf"
TIP_LAMPORTS=1000000                # 0.001 SOL tip (set 0 to disable)

# --- BOT DEFAULTS ---
NUM_SUB_WALLETS=20
SLIPPAGE_BPS=100                    # 1%
FEE_BUFFER_SOL=0.003
MIN_SPEND_SOL=0.0005
SEND_TXS_PER_SEC=1                  # 1 = free RPC, up to 5 for paid

# --- ROUTING PREFERENCES ---
USE_PUMPFUN_FIRST=1                 # 1 = try Pump.fun first
FORCE_RPC=0                         # 1 = skip Jito completely

# --- HIDDEN TRANSFER (Main → External) ---
EXTERNAL_WALLET="your_main_wallet_here"
EXTERNAL_FEE_RESERVE_SOL=0.0005

```

## 🚀 Usage

1️⃣ Installation

git clone git@github.com:martok9803/sol-bundle.git
cd sol-bundle
npm install
cp .env.example .env


## 2️⃣ Start the CLI

npm start

## 3️⃣ Interactive Menu
| Key   | Action               | Description                           |
| ----- | -------------------- | ------------------------------------- |
| **A** | Set Sub-Wallet Count | Choose number of sub-wallets (1–20)   |
| **B** | Show Balances        | Display SOL and token balances        |
| **C** | FUND — Equal Split   | Distribute SOL evenly                 |
| **D** | FUND — Fixed Amount  | Send fixed amount to specific wallets |
| **E** | FUND — Single Wallet | Transfer from MAIN → one wallet       |
| **F** | FUND — Sweep         | Return funds from sub-wallets         |
| **G** | SELL — %             | Sell partial holdings via Pump/Jup    |
| **H** | BUY — All            | Buy from all wallets                  |
| **I** | BUY — Selected       | Buy from chosen wallets               |
| **J** | Hidden Transfer      | MAIN → External wallet                |
| **K** | SELL — 100%          | Sell all tokens instantly             |
| **Q** | Exit                 | Quit program                          |


##🪙 Example Workflows

➤ Fund Wallets

Equal Split: Distribute remaining SOL evenly after reserving a buffer (e.g., 0.1 SOL).

Fixed Amount: Send specific SOL per wallet or wallet range.

Sweep Back: Reclaim leftover SOL from sub-wallets to MAIN.

➤ Buy Tokens

Execute buys from all or selected wallets.

Use fixed or “max” modes.

Automatically chooses Pump.fun or Jupiter based on availability.

➤ Sell Tokens

Sell a percentage (e.g., 25%) or 100% across all wallets.

Routing handled automatically.

----

## 📜 License

MIT License
Copyright (c) 2025 martok9803

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
