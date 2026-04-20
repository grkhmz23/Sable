import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
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
  try {
    const userState = await sdk.getUserState(wallet.publicKey);
    if (!userState) {
      await sdk.join();
      await sleep(500);
    }
  } catch {
    await sdk.join();
    await sleep(500);
  }

  // Ensure mint balance exists
  try {
    const bal = await sdk.getUserBalance(wallet.publicKey, mint);
    if (!bal) {
      await sdk.addMint(mint);
      await sleep(500);
    }
  } catch {
    await sdk.addMint(mint);
    await sleep(500);
  }

  // Ensure vault ATA exists and mint some tokens
  const vaultAta = getAssociatedTokenAddressSync(mint, getPda().deriveVaultAuthority()[0], true);
  try {
    await getConnection().getAccountInfo(vaultAta);
  } catch {
    // ATA might not exist, deposit will create it
  }

  // Mint tokens to wallet ATA then deposit
  const walletAta = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  try {
    await getConnection().getAccountInfo(walletAta);
  } catch {
    const tx = new (await import('@solana/web3.js')).Transaction().add(
      createAssociatedTokenAccountInstruction(wallet.publicKey, walletAta, wallet.publicKey, mint)
    );
    await getConnection().sendAndConfirmTransaction(tx, [wallet]);
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
