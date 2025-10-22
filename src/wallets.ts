import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey
} from "@solana/web3.js";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import { connection, MNEMONIC } from "./config.js";
import {
  getAccount,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";

export function deriveKeypair(index: number): Keypair {
  const seed = bip39.mnemonicToSeedSync(MNEMONIC);
  const path = `m/44'/501'/${index}'/0'`;
  const { key } = derivePath(path, seed.toString("hex"));
  return Keypair.fromSeed(key);
}

export function fmtSOL(n: number | bigint): string {
  const v = typeof n === "bigint" ? Number(n) : n;
  return (v / LAMPORTS_PER_SOL).toFixed(6);
}

export async function solBal(pubkey: PublicKey): Promise<number> {
  return (await connection.getBalance(pubkey)) / LAMPORTS_PER_SOL;
}

export async function tokenBal(mint: PublicKey, owner: PublicKey): Promise<bigint> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const acc = await getAccount(connection, ata);
    return acc.amount;
  } catch {
    return 0n;
  }
}

export function parseSelection(sel: string, max: number): number[] {
  if (!sel || sel.toLowerCase() === "all") return Array.from({ length: max }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of sel.split(",")) {
    const s = part.trim();
    if (!s) continue;
    if (s.includes("-")) {
      const [a, b] = s.split("-").map((n) => parseInt(n, 10));
      if (!isFinite(a) || !isFinite(b)) continue;
      const [start, end] = a <= b ? [a, b] : [b, a];
      for (let i = start; i <= end; i++) if (i >= 1 && i <= max) out.add(i);
    } else {
      const n = parseInt(s, 10);
      if (isFinite(n) && n >= 1 && n <= max) out.add(n);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}
