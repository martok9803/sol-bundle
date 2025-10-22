import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import * as borsh from "@coral-xyz/borsh";
import { sha256 } from "@noble/hashes/sha256";
import { connection, SLIPPAGE_BPS } from "./config.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

const BUY_DISCRIMINATOR = Buffer.from(sha256("global:buy").slice(0, 8));
const SELL_DISCRIMINATOR = Buffer.from(sha256("global:sell").slice(0, 8));

const bondingCurveLayout = borsh.struct([
  borsh.u64("virtualTokenReserves"),
  borsh.u64("virtualSolReserves"),
  borsh.u64("realTokenReserves"),
  borsh.u64("realSolReserves"),
  borsh.u64("tokenTotalSupply"),
  borsh.bool("complete")
]);

function toBI(x: any): bigint { return BigInt(x.toString()); }

export function derivePumpPdas() {
  const [GLOBAL_ACCOUNT] = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID);
  const [FEE_RECIPIENT] = PublicKey.findProgramAddressSync([Buffer.from("fee-recipient")], PROGRAM_ID);
  const [EVENT_AUTHORITY] = PublicKey.findProgramAddressSync([Buffer.from("event-authority")], PROGRAM_ID);
  return { GLOBAL_ACCOUNT, FEE_RECIPIENT, EVENT_AUTHORITY };
}

export async function fetchBondingCurveState(mint: PublicKey): Promise<{
  exists: boolean; complete: boolean; pda?: PublicKey; vTok?: bigint; vSol?: bigint;
}> {
  const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PROGRAM_ID);
  const acc = await connection.getAccountInfo(bondingCurve);
  if (!acc) return { exists: false, complete: false };
  const state = bondingCurveLayout.decode(acc.data.slice(8)) as any;
  return { exists: true, complete: !!state.complete, pda: bondingCurve, vTok: toBI(state.virtualTokenReserves), vSol: toBI(state.virtualSolReserves) };
}

function buildBuyIx(p: {
  payer: PublicKey; mint: PublicKey; bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey; associatedUser: PublicKey;
  solLamports: bigint; minTokenOut: bigint;
  GLOBAL_ACCOUNT: PublicKey; FEE_RECIPIENT: PublicKey; EVENT_AUTHORITY: PublicKey;
}) {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64LE(p.solLamports, 0);
  buf.writeBigUInt64LE(p.minTokenOut, 8);
  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: p.GLOBAL_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: p.FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: p.mint, isSigner: false, isWritable: false },
      { pubkey: p.bondingCurve, isSigner: false, isWritable: true },
      { pubkey: p.associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: p.associatedUser, isSigner: false, isWritable: true },
      { pubkey: p.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: p.EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([BUY_DISCRIMINATOR, buf])
  };
}

function buildSellIx(p: {
  payer: PublicKey; mint: PublicKey; bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey; associatedUser: PublicKey;
  tokenAmount: bigint; minSolOut: bigint;
  GLOBAL_ACCOUNT: PublicKey; FEE_RECIPIENT: PublicKey; EVENT_AUTHORITY: PublicKey;
}) {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64LE(p.tokenAmount, 0);
  buf.writeBigUInt64LE(p.minSolOut, 8);
  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: p.GLOBAL_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: p.FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: p.mint, isSigner: false, isWritable: false },
      { pubkey: p.bondingCurve, isSigner: false, isWritable: true },
      { pubkey: p.associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: p.associatedUser, isSigner: false, isWritable: true },
      { pubkey: p.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: p.EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([SELL_DISCRIMINATOR, buf])
  };
}

export async function pumpBuyVtx(payer: import("@solana/web3.js").Keypair, mint: PublicKey, lamports: bigint, blockhash: string) {
  const curve = await fetchBondingCurveState(mint);
  if (!curve.exists || curve.complete || !curve.pda) throw new Error("Pump: curve missing or complete");
  const { GLOBAL_ACCOUNT, FEE_RECIPIENT, EVENT_AUTHORITY } = derivePumpPdas();

  const expected = (curve.vTok! * lamports) / (curve.vSol! + lamports);
  const minOut = (expected * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

  const associatedBondingCurve = await getAssociatedTokenAddress(mint, curve.pda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const associatedUser = await getAssociatedTokenAddress(mint, payer.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const ixs: any[] = [];
  try { await getAccount(connection, associatedUser); }
  catch { ixs.push(createAssociatedTokenAccountInstruction(payer.publicKey, associatedUser, payer.publicKey, mint)); }

  ixs.push(buildBuyIx({
    payer: payer.publicKey, mint, bondingCurve: curve.pda, associatedBondingCurve, associatedUser,
    solLamports: lamports, minTokenOut: minOut, GLOBAL_ACCOUNT, FEE_RECIPIENT, EVENT_AUTHORITY
  }));

  const msg = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  const vtx = new VersionedTransaction(msg); vtx.sign([payer]); return vtx;
}

export async function pumpSellVtx(payer: import("@solana/web3.js").Keypair, mint: PublicKey, tokenAmount: bigint, blockhash: string) {
  const curve = await fetchBondingCurveState(mint);
  if (!curve.exists || curve.complete || !curve.pda) throw new Error("Pump: curve missing or complete");
  const { GLOBAL_ACCOUNT, FEE_RECIPIENT, EVENT_AUTHORITY } = derivePumpPdas();

  const expected = (curve.vSol! * tokenAmount) / (curve.vTok! + tokenAmount);
  const minOut = (expected * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

  const associatedBondingCurve = await getAssociatedTokenAddress(mint, curve.pda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const associatedUser = await getAssociatedTokenAddress(mint, payer.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const ixs: any[] = [buildSellIx({
    payer: payer.publicKey, mint, bondingCurve: curve.pda, associatedBondingCurve, associatedUser,
    tokenAmount, minSolOut: minOut, GLOBAL_ACCOUNT, FEE_RECIPIENT, EVENT_AUTHORITY
  })];

  const msg = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  const vtx = new VersionedTransaction(msg); vtx.sign([payer]); return vtx;
}
