import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, createMint, mintTo, createAssociatedTokenAccountInstruction, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { SableClient } from '@sable/sdk';
import { PdaHelper, PERMISSION_PROGRAM_ID } from '@sable/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { env } from './env';

export const LOCAL_RPC = env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
export const PROGRAM_ID = new PublicKey(env.SABLE_PROGRAM_ID);

let _connection: Connection | null = null;
let _wallet: Keypair | null = null;
let _sdk: SableClient | null = null;
let _mint: PublicKey | null = null;
let _pda: PdaHelper | null = null;

function loadKeypair(): Keypair {
  const idPath = path.join(process.env.HOME || '/root', '.config/solana/id.json');
  const secret = JSON.parse(fs.readFileSync(idPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(LOCAL_RPC, 'confirmed');
  return _connection;
}

export function getWallet(): Keypair {
  if (!_wallet) _wallet = loadKeypair();
  return _wallet;
}

export function getPda(): PdaHelper {
  if (!_pda) _pda = new PdaHelper(PROGRAM_ID);
  return _pda;
}

export async function getMint(): Promise<PublicKey> {
  if (_mint) return _mint;
  const connection = getConnection();
  const wallet = getWallet();
  const mint = await createMint(connection, wallet, wallet.publicKey, null, 6);
  _mint = mint;
  return mint;
}

export async function ensureSdk(): Promise<SableClient> {
  if (_sdk) return _sdk;

  const connection = getConnection();
  const wallet = getWallet();

  // Airdrop if needed
  const balance = await connection.getBalance(wallet.publicKey);
  if (balance < 2 * LAMPORTS_PER_SOL) {
    await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
    await sleep(500);
  }

  const sdk = new SableClient({
    programId: PROGRAM_ID,
    connection,
    wallet: {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: any) => {
        tx.partialSign(wallet);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        txs.forEach((tx) => tx.partialSign(wallet));
        return txs;
      },
    },
  });

  // Initialize program if needed
  try {
    const config = await sdk.treasury.getUserState(wallet.publicKey);
    if (!config) {
      await sdk.initialize(wallet.publicKey);
      await sleep(500);
    }
  } catch {
    // May already be initialized
  }

  _sdk = sdk;
  return sdk;
}

export async function setupUser(): Promise<{ sdk: SableClient; wallet: Keypair; mint: PublicKey }> {
  const sdk = await ensureSdk();
  const wallet = getWallet();
  const mint = await getMint();

  // Ensure user is joined
  const userStatePda = sdk.pda.deriveUserState(wallet.publicKey)[0];
  const existingUserState = await getConnection().getAccountInfo(userStatePda);
  if (!existingUserState) {
    await sdk.join();
    await sleep(500);
  }

  // Ensure mint balance exists
  const bal = await sdk.getUserBalance(wallet.publicKey, mint);
  if (!bal) {
    await sdk.addMint(mint);
    await sleep(500);
  }

  // Vault ATA is created on-demand by deposit (init_if_needed)

  // Mint tokens to wallet ATA then deposit
  const walletAta = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const walletAtaInfo = await getConnection().getAccountInfo(walletAta);
  if (!walletAtaInfo) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(wallet.publicKey, walletAta, wallet.publicKey, mint)
    );
    await sendAndConfirmTransaction(getConnection(), tx, [wallet]);
  }

  await mintTo(getConnection(), wallet, mint, walletAta, wallet.publicKey, 1_000_000_000);
  await sleep(500);

  // Deposit into treasury
  await sdk.deposit({ mint, amount: new BN(500_000_000) });
  await sleep(500);

  return { sdk, wallet, mint };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function envIsSet(key: string): boolean {
  return !!process.env[key];
}
