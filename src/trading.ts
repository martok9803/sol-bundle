import readline from "readline";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction
} from "@solana/web3.js";
import { connection, FEE_BUFFER_SOL, MIN_SPEND_SOL, NUM_SUB_WALLETS, SLIPPAGE_BPS, USE_PUMPFUN_FIRST } from "./config.js";
import { deriveKeypair, fmtSOL, parseSelection, solBal } from "./wallets.js";
import { sendViaJitoOrRpc } from "./jito.js";
import { jupSolToToken, jupTokenToSol } from "./jupiter.js";
import { pumpBuyVtx, pumpSellVtx } from "./pumpfun.js";
import { getAccount, getAssociatedTokenAddress, getMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const mainKp = deriveKeypair(0);
export let subs: Keypair[] = Array.from({ length: NUM_SUB_WALLETS }, (_, i) => deriveKeypair(i + 1));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
export const ask = (q: string) => new Promise<string>((res) => rl.question(q, (ans) => res(ans.trim())));

export async function showBalances() {
  console.log("\nBalances:");
  const main = await connection.getBalance(mainKp.publicKey);
  console.log(`Main ${mainKp.publicKey.toBase58()} → ${fmtSOL(main)} SOL`);
  for (let i = 0; i < subs.length; i++) {
    const lamports = await connection.getBalance(subs[i].publicKey);
    console.log(`Sub#${i + 1} ${subs[i].publicKey.toBase58()} → ${fmtSOL(lamports)} SOL`);
  }
}

export async function setWalletCount() {
  const ans = await ask(`How many sub-wallets to use? (1–20) [current ${subs.length}]: `);
  const n = parseInt(ans, 10);
  if (!isFinite(n) || n < 1 || n > 20) { console.log("Invalid number."); return; }
  subs = Array.from({ length: n }, (_, i) => deriveKeypair(i + 1));
  console.log(`OK. Using ${n} sub-wallet(s).`);
}

async function buildBuyTxAuto(payer: Keypair, mint: PublicKey, lamports: bigint, blockhash: string): Promise<{ vtx: VersionedTransaction; route: "pump" | "jup" }> {
  if (USE_PUMPFUN_FIRST) {
    try { return { vtx: await pumpBuyVtx(payer, mint, lamports, blockhash), route: "pump" }; }
    catch {}
  }
  return { vtx: await jupSolToToken(payer, mint, lamports), route: "jup" };
}
async function buildSellTxAuto(payer: Keypair, mint: PublicKey, tokenAmount: bigint, blockhash: string): Promise<{ vtx: VersionedTransaction; route: "pump" | "jup" }> {
  if (USE_PUMPFUN_FIRST) {
    try { return { vtx: await pumpSellVtx(payer, mint, tokenAmount, blockhash), route: "pump" }; }
    catch {}
  }
  return { vtx: await jupTokenToSol(payer, mint, tokenAmount), route: "jup" };
}

export async function buyAll() {
  const mintStr = await ask("Mint address: ");
  const mint = new PublicKey(mintStr);
  await getMint(connection, mint);
  const mode = (await ask("Spend 'fixed' SOL per wallet or 'max' (all minus fee buffer)? (fixed/max): ")).toLowerCase();
  let fixedAmt = 0;
  if (mode === "fixed") {
    fixedAmt = Number(await ask("SOL amount per wallet (e.g., 0.01): "));
    if (!(fixedAmt > 0)) { console.log("Invalid amount."); return; }
  } else if (mode !== "max") {
    console.log("Unknown choice."); return;
  }

  const { blockhash } = await connection.getLatestBlockhash();
  const txs: VersionedTransaction[] = [];
  const notes: string[] = [];

  for (let i = 0; i < subs.length; i++) {
    const kp = subs[i];
    let spend = fixedAmt;
    if (mode === "max") {
      const bal = await solBal(kp.publicKey);
      spend = Math.max(0, bal - FEE_BUFFER_SOL);
      if (spend < MIN_SPEND_SOL) { notes.push(`• Sub#${i + 1} ${kp.publicKey.toBase58()} → insufficient SOL`); continue; }
    }
    const lamports = BigInt(Math.floor(spend * LAMPORTS_PER_SOL));
    try {
      const { vtx, route } = await buildBuyTxAuto(kp, mint, lamports, blockhash);
      txs.push(vtx);
      notes.push(`✓ Sub#${i + 1} ${kp.publicKey.toBase58()} → Buy spend ${spend} SOL via ${route === "pump" ? "Pump.fun" : "Jupiter"}`);
    } catch (e: any) {
      notes.push(`• Sub#${i + 1} ${kp.publicKey.toBase58()} → Build failed (${e.message || e})`);
    }
  }

  if (!txs.length) { console.log("Nothing to send."); return; }
  const ids = await (await import("./jito.js")).sendViaJitoOrRpc(txs, blockhash);
  console.log("\nTx signatures:", ids);
  console.log("\nBuy summary:"); notes.forEach((n) => console.log(n));
}

export async function buySelected() {
  const mintStr = await ask("Mint address: ");
  const mint = new PublicKey(mintStr);
  await getMint(connection, mint);

  const selection = await ask("Select wallets (e.g., all or 1-5,8,10 or single index): ");
  const selected = parseSelection(selection, subs.length);
  if (!selected.length) { console.log("No wallets selected."); return; }

  const same = await ask("Apply SAME SOL amount to all selected? (y/n): ");
  let amountAll = 0;
  if (same.toLowerCase().startsWith("y")) {
    amountAll = Number(await ask("SOL amount per wallet (e.g., 0.01): "));
    if (!(amountAll > 0)) { console.log("Invalid amount."); return; }
  }

  const { blockhash } = await connection.getLatestBlockhash();
  const txs: VersionedTransaction[] = [];
  const notes: string[] = [];

  for (const idx of selected) {
    const kp = subs[idx - 1];
    let spend = amountAll;
    if (!amountAll) {
      const inp = await ask(`Wallet #${idx} ${kp.publicKey.toBase58()} — SOL to spend (0=skip, 'max' to spend all minus ${FEE_BUFFER_SOL}): `);
      if (inp.toLowerCase() === "max") {
        const bal = await solBal(kp.publicKey);
        spend = Math.max(0, bal - FEE_BUFFER_SOL);
        if (spend < MIN_SPEND_SOL) { notes.push(`• Sub#${idx} ${kp.publicKey.toBase58()} → insufficient SOL`); continue; }
      } else {
        spend = Number(inp);
        if (spend === 0) { notes.push(`• Sub#${idx} ${kp.publicKey.toBase58()} → skipped`); continue; }
        if (!(spend > 0)) { notes.push(`• Sub#${idx} ${kp.publicKey.toBase58()} → invalid amount`); continue; }
      }
    }
    const lamports = BigInt(Math.floor(spend * LAMPORTS_PER_SOL));
    try {
      const { vtx, route } = await buildBuyTxAuto(kp, mint, lamports, blockhash);
      txs.push(vtx);
      notes.push(`✓ Sub#${idx} ${kp.publicKey.toBase58()} → Buy spend ${spend} SOL via ${route === "pump" ? "Pump.fun" : "Jupiter"}`);
    } catch (e: any) {
      notes.push(`• Sub#${idx} ${kp.publicKey.toBase58()} → Build failed (${e.message || e})`);
    }
  }

  if (!txs.length) { console.log("Nothing to send."); return; }
  const ids = await sendViaJitoOrRpc(txs, blockhash);
  console.log("\nTx signatures:", ids);
  console.log("\nBuy summary:"); notes.forEach((n) => console.log(n));
}

export async function sellPercent() {
  const mintStr = await ask("Mint address: ");
  const mint = new PublicKey(mintStr);
  const mintInfo = await getMint(connection, mint);
  const decimals = mintInfo.decimals;

  const selection = await ask("Select wallets (all or 1-5,8,10 or single index): ");
  const selected = parseSelection(selection, subs.length);
  if (!selected.length) { console.log("No wallets selected."); return; }

  const same = await ask("Apply SAME percent to all selected? (y/n): ");
  let percentAll = 0;
  if (same.toLowerCase().startsWith("y")) {
    percentAll = Number(await ask("Percent to sell (1-100): "));
    if (!(percentAll > 0 && percentAll <= 100)) { console.log("Invalid percent."); return; }
  }

  const { blockhash } = await connection.getLatestBlockhash();
  const txs: VersionedTransaction[] = [];
  const notes: string[] = [];

  for (const idx of selected) {
    const kp = subs[idx - 1];
    const ata = await getAssociatedTokenAddress(mint, kp.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    let bal = 0n; try { bal = (await getAccount(connection, ata)).amount; } catch {}
    if (bal === 0n) { notes.push(`• Sub#${idx} ${kp.publicKey.toBase58()} → 0 tokens`); continue; }

    let pct = percentAll;
    if (!percentAll) {
      pct = Number(await ask(`Wallet #${idx} ${kp.publicKey.toBase58()} balance ${(Number(bal) / 10 ** decimals).toFixed(6)} — percent to sell (1-100, 0=skip): `));
      if (pct === 0) { notes.push(`• Sub#${idx} ${kp.publicKey.toBase58()} → skipped`); continue; }
      if (!(pct > 0 && pct <= 100)) { notes.push(`• Sub#${idx} ${kp.publicKey.toBase58()} → invalid percent`); continue; }
    }
    const sellAmount = (bal * BigInt(Math.floor(pct * 1000))) / 100000n; // 3dp
    if (sellAmount === 0n) { notes.push(`• Sub#${idx} → computed 0`); continue; }

    try {
      const { vtx, route } = await buildSellTxAuto(kp, mint, sellAmount, blockhash);
      txs.push(vtx);
      notes.push(`✓ Sub#${idx} ${kp.publicKey.toBase58()} → Sell ${(Number(sellAmount) / 10 ** decimals).toFixed(6)} via ${route === "pump" ? "Pump.fun" : "Jupiter"}`);
    } catch (e: any) {
      notes.push(`• Sub#${idx} ${kp.publicKey.toBase58()} → Build failed (${e.message || e})`);
    }
  }

  if (!txs.length) { console.log("Nothing to send."); return; }
  const ids = await sendViaJitoOrRpc(txs, blockhash);
  console.log("\nTx signatures:", ids);
  console.log("\nSell summary:"); notes.forEach((n) => console.log(n));
}

export async function sellAll() {
  const mintStr = await ask("Mint address: ");
  const mint = new PublicKey(mintStr);
  const mintInfo = await getMint(connection, mint);
  const decimals = mintInfo.decimals;

  const { blockhash } = await connection.getLatestBlockhash();
  const txs: VersionedTransaction[] = [];
  const notes: string[] = [];

  for (let i = 0; i < subs.length; i++) {
    const kp = subs[i];
    const ata = await getAssociatedTokenAddress(mint, kp.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    let bal = 0n; try { bal = (await getAccount(connection, ata)).amount; } catch {}
    if (bal === 0n) { notes.push(`• Sub#${i + 1} ${kp.publicKey.toBase58()} → 0 tokens`); continue; }

    try {
      const { vtx, route } = await buildSellTxAuto(kp, mint, bal, blockhash);
      txs.push(vtx);
      notes.push(`✓ Sub#${i + 1} ${kp.publicKey.toBase58()} → Sell ALL (${(Number(bal) / 10 ** decimals).toFixed(6)}) via ${route === "pump" ? "Pump.fun" : "Jupiter"}`);
    } catch (e: any) {
      notes.push(`• Sub#${i + 1} ${kp.publicKey.toBase58()} → Build failed (${e.message || e})`);
    }
  }

  if (!txs.length) { console.log("No wallets have tokens to sell."); return; }
  const ids = await sendViaJitoOrRpc(txs, blockhash);
  console.log("\nTx signatures:", ids);
  console.log("\nSell ALL summary:"); notes.forEach((n) => console.log(n));
}

export { rl };
