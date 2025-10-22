import dotenv from "dotenv";
import { Connection } from "@solana/web3.js";

dotenv.config();

export const MNEMONIC = process.env.MNEMONIC as string;
if (!MNEMONIC) throw new Error("MNEMONIC not set in .env");

export const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
export const WS_URL = process.env.WS_URL;

export const RAW_JITO_URL = process.env.JITO_URL || "ny.mainnet.block-engine.jito.wtf";
export const JITO_HOST = RAW_JITO_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

export let NUM_SUB_WALLETS = Number(process.env.NUM_SUB_WALLETS || 20); // mutable
export const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || 100);
export const TIP_LAMPORTS = Number(process.env.TIP_LAMPORTS || 0);
export const FEE_BUFFER_SOL = Number(process.env.FEE_BUFFER_SOL || 0.003);
export const MIN_SPEND_SOL = Number(process.env.MIN_SPEND_SOL || 0.0005);
export const SEND_TXS_PER_SEC = Math.max(1, Number(process.env.SEND_TXS_PER_SEC || 1));
export const USE_PUMPFUN_FIRST = String(process.env.USE_PUMPFUN_FIRST || "1") === "1";
export const FORCE_RPC = String(process.env.FORCE_RPC || "0") === "1";

export const EXTERNAL_WALLET = (process.env.EXTERNAL_WALLET || "").trim();
export const EXTERNAL_FEE_RESERVE_SOL = Number(process.env.EXTERNAL_FEE_RESERVE_SOL || 0.0005);

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  wsEndpoint: WS_URL,
  httpHeaders: { "Content-Type": "application/json" }
});
