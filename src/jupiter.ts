import { VersionedTransaction } from "@solana/web3.js";
import { WSOL_MINT, SLIPPAGE_BPS } from "./config.js";

type JupQuote = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  routePlan: any[];
};
type JupSwapResp = { swapTransaction: string };

async function jupGetQuote(inputMint: string, outputMint: string, amount: bigint, slippageBps: number): Promise<JupQuote> {
  const url = new URL("https://quote-api.jup.ag/v6/quote");
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount.toString());
  url.searchParams.set("slippageBps", String(slippageBps));
  url.searchParams.set("swapMode", "ExactIn");
  url.searchParams.set("onlyDirectRoutes", "false");
  url.searchParams.set("asLegacyTransaction", "false");

  for (let i = 0; i < 3; i++) {
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      if (data && data.routePlan) return data as JupQuote;
      throw new Error("Jupiter quote: no route");
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw new Error("Jupiter quote failed");
}

async function jupBuildSwapTx(payerPubkey: string, quote: JupQuote, sign: (vtx: VersionedTransaction) => void): Promise<VersionedTransaction> {
  const body = {
    quoteResponse: quote,
    userPublicKey: payerPubkey,
    wrapAndUnwrapSol: true,
    useSharedAccounts: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: "auto"
  };
  for (let i = 0; i < 3; i++) {
    const res = await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const data = (await res.json()) as JupSwapResp;
      const raw = Buffer.from(data.swapTransaction, "base64");
      const vtx = VersionedTransaction.deserialize(raw);
      sign(vtx);
      return vtx;
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw new Error("Jupiter swap build failed");
}

export async function jupSolToToken(payer: import("@solana/web3.js").Keypair, mint: import("@solana/web3.js").PublicKey, lamports: bigint): Promise<VersionedTransaction> {
  const quote = await jupGetQuote(WSOL_MINT, mint.toBase58(), lamports, SLIPPAGE_BPS);
  return jupBuildSwapTx(payer.publicKey.toBase58(), quote, (v) => v.sign([payer]));
}

export async function jupTokenToSol(payer: import("@solana/web3.js").Keypair, mint: import("@solana/web3.js").PublicKey, amount: bigint): Promise<VersionedTransaction> {
  const quote = await jupGetQuote(mint.toBase58(), WSOL_MINT, amount, SLIPPAGE_BPS);
  return jupBuildSwapTx(payer.publicKey.toBase58(), quote, (v) => v.sign([payer]));
}
