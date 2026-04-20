import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createMint,
  mintTo,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  createInitializeMintInstruction,
} from '@solana/spl-token';
import { assert } from 'chai';
import { SableClient } from '../src/client';
import { PROGRAM_ID_DEVNET } from '@sable/common';

describe('SDK Treasury', () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const payer = provider.wallet as anchor.Wallet;
  let client: SableClient;
  let mint: PublicKey;

  before(async () => {
    client = new SableClient({
      programId: PROGRAM_ID_DEVNET,
      connection: provider.connection,
      wallet: payer,
    });

    // Create a test mint
    const mintKeypair = Keypair.generate();
    const lamports = await getMinimumBalanceForRentExemptMint(provider.connection);
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: anchor.utils.token.TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        9,
        payer.publicKey,
        null
      )
    );
    await provider.sendAndConfirm(tx, [mintKeypair]);
    mint = mintKeypair.publicKey;

    // Mint tokens to payer
    const payerAta = getAssociatedTokenAddressSync(mint, payer.publicKey);
    const createAtaTx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        payerAta,
        payer.publicKey,
        mint
      )
    );
    await provider.sendAndConfirm(createAtaTx);
    await mintTo(provider.connection, payer.payer, mint, payerAta, payer.publicKey, 1_000_000_000);
  });

  it('completeSetup + addMint round-trip', async () => {
    // completeSetup creates userState + wSOL balance
    await client.completeSetup([mint]);

    const userState = await client.getUserState(payer.publicKey);
    assert.isNotNull(userState);
    assert.equal(userState.owner.toBase58(), payer.publicKey.toBase58());

    const wsolBalance = await client.getUserBalance(payer.publicKey, client.wsolMint);
    assert.isNotNull(wsolBalance);
    assert.equal(wsolBalance.amount.toNumber(), 0);

    const mintBalance = await client.getUserBalance(payer.publicKey, mint);
    assert.isNotNull(mintBalance);
    assert.equal(mintBalance.amount.toNumber(), 0);
  });

  it('deposit increases balance', async () => {
    const amount = new BN(100_000_000); // 0.1 with 9 decimals
    await client.deposit({ mint, amount });

    const balance = await client.getUserBalance(payer.publicKey, mint);
    assert.isNotNull(balance);
    assert.equal(balance.amount.toString(), amount.toString());
  });

  it('transferBatch moves tokens between users', async () => {
    const recipient = Keypair.generate();

    // Airdrop to recipient for account creation
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(recipient.publicKey, LAMPORTS_PER_SOL)
    );

    // Recipient joins
    const recipientClient = new SableClient({
      programId: PROGRAM_ID_DEVNET,
      connection: provider.connection,
      wallet: { publicKey: recipient.publicKey, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs } as any,
    });
    await recipientClient.join();

    const transferAmount = new BN(50_000_000);
    await client.transferBatch({
      mint,
      items: [{ toOwner: recipient.publicKey, amount: transferAmount }],
    });

    const senderBalance = await client.getUserBalance(payer.publicKey, mint);
    const recipientBalance = await recipientClient.getUserBalance(recipient.publicKey, mint);

    assert.equal(senderBalance.amount.toString(), '50000000');
    assert.equal(recipientBalance.amount.toString(), '50000000');
  });

  it('withdraw decreases balance', async () => {
    const withdrawAmount = new BN(25_000_000);
    await client.withdraw({ mint, amount: withdrawAmount });

    const balance = await client.getUserBalance(payer.publicKey, mint);
    assert.equal(balance.amount.toString(), '25000000');
  });
});
