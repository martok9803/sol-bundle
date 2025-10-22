import {
  SystemProgram,
  VersionedTransaction,
  TransactionMessage,
  SendTransactionError
} from "@solana/web3.js";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher.js";
import {
  connection,
  FORCE_RPC,
  JITO_HOST,
  SEND_TXS_PER_SEC,
  TIP_LAMPORTS
} from "./config.js";
import { Keypair } from "@solana/web3.js";
import { mainKp } from "./trading.js";

const jito = searcherClient(JITO_HOST);

function getValueOrThrow<T>(res: any, ctx: string): T {
  if (res && res.ok) return res.value as T;
  const err = res && "error" in res ? String(res.error) : "unknown error";
  throw new Error(`${ctx}: ${err}`);
}

async function buildTipVtx(blockhash: string): Promise<VersionedTransaction | null> {
  try {
    if (!TIP_LAMPORTS || TIP_LAMPORTS <= 0) return null;
    const tipRes = await jito.getTipAccounts();
    const tipAccounts = getValueOrThrow<string[]>(tipRes, "Failed to get tip accounts");
    const tipAccount = Keypair.generate().publicKey.constructor.from ? null : null; // TS quiet (not used)

    const tip = tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
    const ix = SystemProgram.transfer({
      fromPubkey: mainKp.publicKey,
      toPubkey: (await import("@solana/web3.js")).PublicKey.fromBase58(tip),
      lamports: TIP_LAMPORTS
    });
    const msg = new TransactionMessage({
      payerKey: mainKp.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix]
    }).compileToV0Message();
    const vtx = new VersionedTransaction(msg);
    vtx.sign([mainKp]);
    return vtx;
  } catch (e) {
    console.warn("Tip disabled / Jito issue:", (e as Error).message || e);
    return null;
  }
}

export async function sendViaJitoOrRpc(vtxs: VersionedTransaction[], blockhash: string): Promise<string[]> {
  if (!vtxs.length) return [];
  const ids: string[] = [];

  if (!FORCE_RPC) {
    try {
      const tipTx = await buildTipVtx(blockhash);
      for (let i = 0; i < vtxs.length; i += 4) {
        const slice = vtxs.slice(i, i + 4);
        const bundle = new Bundle([], 5);
        for (const t of slice) bundle.addTransactions(t);
        if (tipTx) bundle.addTransactions(tipTx);
        const res = await jito.sendBundle(bundle);
        if (res && res.ok) ids.push(res.value as string);
        else {
          const err = res && "error" in (res as any) ? String((res as any).error) : "unknown error";
          throw new Error(err);
        }
      }
      return ids;
    } catch (e) {
      console.warn("Jito unavailable, falling back to direct RPC:", (e as Error).message || e);
    }
  }

  // Direct RPC with throttle
  const intervalMs = Math.ceil(1000 / Math.max(1, SEND_TXS_PER_SEC));
  for (let i = 0; i < vtxs.length; i++) {
    try {
      const sig = await connection.sendTransaction(vtxs[i], { skipPreflight: false, maxRetries: 3 });
      ids.push(sig);
    } catch (e2) {
      const se = e2 as SendTransactionError;
      console.error("RPC send failed:", se.message || e2);
      if ((se as any).logs && Array.isArray((se as any).logs)) {
        console.error("Simulation logs:");
        console.error((se as any).logs.join("\n"));
      }
    }
    if (i < vtxs.length - 1) {
      const jitter = Math.floor(Math.random() * 120);
      await new Promise((r) => setTimeout(r, intervalMs + jitter));
    }
  }
  return ids;
}
