import { rl, ask, buyAll, buySelected, sellAll, sellPercent, setWalletCount, showBalances } from "./trading.js";
import { connection } from "./config.js";
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { mainKp, subs } from "./trading.js";
import { fmtSOL, parseSelection, solBal } from "./wallets.js";
import { vtxTransfer, sendTransfersThrottled, transferMainToExternal } from "./funding.js";

console.log("Jupiter+Pump.fun Multi-Wallet Trader — starting...");
console.log(`Main: ${mainKp.publicKey.toBase58()}`);
console.log(`Using ${subs.length} sub-wallet(s).`);

async function fundEqualSplit() {
  const selection = await ask("Select wallets to fund (all or 1-5,8,10): ");
  const selected = parseSelection(selection, subs.length);
  if (!selected.length) return console.log("No wallets selected.");

  const reserveStr = await ask("Reserve to keep on MAIN (e.g., 0.10): ");
  const reserve = Number(reserveStr);
  if (!(reserve >= 0)) return console.log("Invalid reserve.");

  const mainLamports = await connection.getBalance(mainKp.publicKey);
  const mainSol = mainLamports / LAMPORTS_PER_SOL;
  const distributable = mainSol - reserve;
  if (distributable <= 0) return console.log("Nothing to distribute.");

  const perLamports = BigInt(Math.floor((distributable / selected.length) * LAMPORTS_PER_SOL));
  const { blockhash } = await connection.getLatestBlockhash();
  const vtxs: VersionedTransaction[] = [];

  for (const idx of selected) {
    const kp = subs[idx - 1];
    const ix = SystemProgram.transfer({ fromPubkey: mainKp.publicKey, toPubkey: kp.publicKey, lamports: perLamports });
    const msg = new TransactionMessage({ payerKey: mainKp.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
    const vtx = new VersionedTransaction(msg); vtx.sign([mainKp]); vtxs.push(vtx);
  }
  const sigs = await sendTransfersThrottled(vtxs);
  console.log("Transfer sigs:", sigs);
}

async function fundFixedPerWallet() {
  const selection = await ask("Select wallets to fund (all or 1-5,8,10): ");
  const selected = parseSelection(selection, subs.length);
  if (!selected.length) return console.log("No wallets selected.");

  const amtStr = await ask("Fixed SOL amount per wallet (e.g., 0.02): ");
  const amt = Number(amtStr);
  if (!(amt > 0)) return console.log("Invalid amount.");
  const lamports = BigInt(Math.floor(amt * LAMPORTS_PER_SOL));

  const totalLamports = lamports * BigInt(selected.length);
  const mainLamports = await connection.getBalance(mainKp.publicKey);
  if (BigInt(mainLamports) <= totalLamports) {
    console.log("Warning: Main wallet may not have enough SOL for all transfers (fees included).");
  }

  const { blockhash } = await connection.getLatestBlockhash();
  const vtxs: VersionedTransaction[] = [];
  for (const idx of selected) {
    const kp = subs[idx - 1];
    const ix = SystemProgram.transfer({ fromPubkey: mainKp.publicKey, toPubkey: kp.publicKey, lamports });
    const msg = new TransactionMessage({ payerKey: mainKp.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
    const vtx = new VersionedTransaction(msg); vtx.sign([mainKp]); vtxs.push(vtx);
  }
  const sigs = await sendTransfersThrottled(vtxs);
  console.log("Transfer sigs:", sigs);
}

async function fundSingleWallet() {
  const idxStr = await ask(`Which wallet index? (1–${subs.length}): `);
  const idx = parseInt(idxStr, 10);
  if (!isFinite(idx) || idx < 1 || idx > subs.length) return console.log("Invalid wallet index.");
  const amtStr = await ask("SOL amount to send (e.g., 1 or 0.23): ");
  const amt = Number(amtStr);
  if (!(amt > 0)) return console.log("Invalid amount.");
  const lamports = BigInt(Math.floor(amt * LAMPORTS_PER_SOL));
  const v = await vtxTransfer(mainKp, subs[idx - 1].publicKey, lamports);
  const sig = await connection.sendTransaction(v, { skipPreflight: false, maxRetries: 3 });
  console.log(`Sent ${amt} SOL to Sub#${idx} ${subs[idx - 1].publicKey.toBase58()}`);
  console.log(`Signature: ${sig}`);
}

async function sweepBackToMain() {
  const selection = await ask("Select wallets to sweep back (all or 1-5,8,10): ");
  const selected = parseSelection(selection, subs.length);
  if (!selected.length) return console.log("No wallets selected.");

  const keepStr = await ask("Keep how much SOL on each sub before sweeping? (e.g., 0.003): ");
  const keep = Number(keepStr);
  if (!(keep >= 0)) return console.log("Invalid keep amount.");

  const { blockhash } = await connection.getLatestBlockhash();
  const vtxs: VersionedTransaction[] = [];

  for (const idx of selected) {
    const kp = subs[idx - 1];
    const bal = await solBal(kp.publicKey);
    const sendSol = Math.max(0, bal - keep);
    if (sendSol <= 0) continue;
    const lamports = BigInt(Math.floor(sendSol * LAMPORTS_PER_SOL));
    const ix = SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: mainKp.publicKey, lamports });
    const msg = new TransactionMessage({ payerKey: kp.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
    const vtx = new VersionedTransaction(msg); vtx.sign([kp]); vtxs.push(vtx);
  }

  const sigs = await sendTransfersThrottled(vtxs);
  console.log("Sweep sigs:", sigs);
}

async function menu() {
  console.log("\nChoose action:");
  console.log("A) Set number of sub-wallets (1–20)");
  console.log("B) Show balances");
  console.log("C) FUND — Equal split from MAIN");
  console.log("D) FUND — Fixed amount per SELECTED wallets");
  console.log("E) FUND — Single wallet transfer");
  console.log("F) FUND — Sweep back to MAIN");
  console.log("G) SELL — Percentage by wallet (auto Pump/Jup)");
  console.log("H) BUY  — ALL wallets (auto Pump/Jup)");
  console.log("I) BUY  — SELECTED wallets (auto Pump/Jup)");
  console.log("J) (hidden) MAIN → external");
  console.log("K) SELL — ALL wallets (100%) (auto Pump/Jup)");
  console.log("Q) Exit");

  const choice = (await ask("> ")).toUpperCase();
  if (choice === "Q") { rl.close(); return; }

  try {
    if (choice === "A") await setWalletCount();
    else if (choice === "B") await showBalances();
    else if (choice === "C") await fundEqualSplit();
    else if (choice === "D") await fundFixedPerWallet();
    else if (choice === "E") await fundSingleWallet();
    else if (choice === "F") await sweepBackToMain();
    else if (choice === "G") await sellPercent();
    else if (choice === "H") await buyAll();
    else if (choice === "I") await buySelected();
    else if (choice === "J") await (await import("./funding.js")).transferMainToExternal(mainKp);
    else if (choice === "K") await sellAll();
    else console.log("Unknown option");
  } catch (e: any) {
    console.error("Error:", e.message || e);
  }

  return menu();
}

menu();
