import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
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
let _testBank: Keypair | null = null;

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

const BANK_CACHE_PATH = '/tmp/sable-test-bank.json';

function loadOrCreateBank(): Keypair {
  if (fs.existsSync(BANK_CACHE_PATH)) {
    const secret = JSON.parse(fs.readFileSync(BANK_CACHE_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  const bank = Keypair.generate();
  fs.writeFileSync(BANK_CACHE_PATH, JSON.stringify(Array.from(bank.secretKey)));
  return bank;
}

async function getTestBank(): Promise<Keypair> {
  if (_testBank) return _testBank;
  const bank = loadOrCreateBank();
  const connection = getConnection();

  const currentBalance = await connection.getBalance(bank.publicKey);
  if (currentBalance < 5 * LAMPORTS_PER_SOL) {
    // Need to fund. Try 10 SOL airdrop first, then split into two 5s.
    let funded = false;
    try {
      await connection.requestAirdrop(bank.publicKey, 10 * LAMPORTS_PER_SOL);
      funded = true;
    } catch {
      // ignore, try split
    }

    if (!funded) {
      try {
        await connection.requestAirdrop(bank.publicKey, 5 * LAMPORTS_PER_SOL);
        await sleep(1000);
        await connection.requestAirdrop(bank.publicKey, 5 * LAMPORTS_PER_SOL);
        funded = true;
      } catch {
        // ignore, will try deployer fallback
      }
    }

    if (!funded) {
      const deployer = getWallet();
      const deployerBalance = await connection.getBalance(deployer.publicKey);
      const transferLamports = Math.min(deployerBalance - LAMPORTS_PER_SOL, 5 * LAMPORTS_PER_SOL);
      if (transferLamports < 3 * LAMPORTS_PER_SOL) {
        throw new Error(
          `Deployer has insufficient SOL (${deployerBalance / LAMPORTS_PER_SOL}) to fund test bank. ` +
            `Send more devnet SOL to ${deployer.publicKey.toBase58()}`
        );
      }
      const transferIx = SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: bank.publicKey,
        lamports: transferLamports,
      });
      await sendAndConfirmTransaction(connection, new Transaction().add(transferIx), [deployer]);
    }

    await sleep(500);
    const finalBalance = await connection.getBalance(bank.publicKey);
    if (finalBalance < 4 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Test bank funding failed: ${finalBalance / LAMPORTS_PER_SOL} SOL < 4 SOL required`
      );
    }
  }

  _testBank = bank;
  return bank;
}

export async function setupUser(
  testUserKeypair?: Keypair
): Promise<{ sdk: SableClient; wallet: Keypair; mint: PublicKey }> {
  // Rate-limit mitigation: pause between specs
  await sleep(2000);

  const wallet = testUserKeypair || Keypair.generate();
  const connection = getConnection();
  const mint = await getMint();

  // Fund test user from test bank
  const balance = await connection.getBalance(wallet.publicKey);
  if (balance < 0.3 * LAMPORTS_PER_SOL) {
    const bank = await getTestBank();

    // Pre-spec guard: bank must have >= 1 SOL
    const bankBalance = await connection.getBalance(bank.publicKey);
    if (bankBalance < 1 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Test bank depleted: ${bankBalance / LAMPORTS_PER_SOL} SOL < 1 SOL. ` +
          `Delete ${BANK_CACHE_PATH} and re-run to re-fund.`
      );
    }

    const transferIx = SystemProgram.transfer({
      fromPubkey: bank.publicKey,
      toPubkey: wallet.publicKey,
      lamports: 0.3 * LAMPORTS_PER_SOL,
    });
    await sendAndConfirmTransaction(connection, new Transaction().add(transferIx), [bank]);
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

  // Ensure user is joined
  const userStatePda = sdk.pda.deriveUserState(wallet.publicKey)[0];
  const existingUserState = await connection.getAccountInfo(userStatePda);
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

  // Ensure wallet ATA exists
  const walletAta = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const walletAtaInfo = await connection.getAccountInfo(walletAta);
  if (!walletAtaInfo) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(wallet.publicKey, walletAta, wallet.publicKey, mint)
    );
    await sendAndConfirmTransaction(connection, tx, [wallet]);
  }

  // Mint tokens to wallet ATA (deployer is mint authority)
  const deployer = getWallet();
  await mintTo(connection, deployer, mint, walletAta, deployer.publicKey, 1_000_000_000);
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
