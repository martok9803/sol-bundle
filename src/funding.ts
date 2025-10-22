import {
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { connection, EXTERNAL_FEE_RESERVE_SOL, EXTERNAL_WALLET, SEND_TXS_PER_SEC } from "./config.js";
import { fmtSOL, solBal } from "./wallets.js";

export async function sendTransfersThrottled(vtxs: VersionedTransaction[]): Promise<string[]> {
  const ids: string[] = [];
  const intervalMs = Math.ceil(1000 / Math.max(1, SEND_TXS_PER_SEC));
  for (let i = 0; i < vtxs.length; i++) {
    try {
      const sig = await connection.sendTransaction(vtxs[i], { skipPreflight: false, maxRetries: 3 });
      ids.push(sig);
    } catch (e) {
      console.error("Transfer send failed:", (e as Error).message || e);
    }
    if (i < vtxs.length - 1) {
      const jitter = Math.floor(Math.random() * 120);
      await new Promise((r) => setTimeout(r, intervalMs + jitter));
    }
  }
  return ids;
}

export async function vtxTransfer(from: import("@solana/web3.js").Keypair, to: import("@solana/web3.js").PublicKey, lamports: bigint) {
  const { blockhash } = await connection.getLatestBlockhash();
  const ix = SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports });
  const msg = new TransactionMessage({ payerKey: from.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
  const vtx = new VersionedTransaction(msg); vtx.sign([from]); return vtx;
}

export async function transferMainToExternal(mainKp: import("@solana/web3.js").Keypair) {
  if (!EXTERNAL_WALLET) {
    console.log("EXTERNAL_WALLET not set in .env");
    return;
  }
  let target: import("@solana/web3.js").PublicKey;
  try { target = new (await import("@solana/web3.js")).PublicKey(EXTERNAL_WALLET); }
  catch { console.log("EXTERNAL_WALLET invalid."); return; }

  const mainLamports = await connection.getBalance(mainKp.publicKey);
  const reserveLamports = Math.floor(EXTERNAL_FEE_RESERVE_SOL * LAMPORTS_PER_SOL);
  const sendLamports = mainLamports - reserveLamports;
  if (sendLamports <= 0) {
    console.log(`Nothing to send. MAIN has ~${fmtSOL(mainLamports)} SOL.`);
    return;
  }
  const v = await vtxTransfer(mainKp, target, BigInt(sendLamports));
  const sig = await connection.sendTransaction(v, { skipPreflight: false, maxRetries: 3 });
  console.log(`Transferred ${fmtSOL(sendLamports)} SOL from MAIN to ${target.toBase58()}`);
  console.log(`Signature: ${sig}`);
}
