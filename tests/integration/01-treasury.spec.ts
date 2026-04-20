import { expect } from 'chai';
import { BN } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { setupUser, sleep, ensureSdk, getWallet, getMint, getPda } from './helpers/setup';
import { checkConservation } from './helpers/conservation';

describe('01-treasury', () => {
  let sdk: Awaited<ReturnType<typeof setupUser>>['sdk'];
  let wallet: Awaited<ReturnType<typeof setupUser>>['wallet'];
  let mint: Awaited<ReturnType<typeof setupUser>>['mint'];
  let recipientSdk: Awaited<ReturnType<typeof setupUser>>['sdk'];
  let recipientWallet: Awaited<ReturnType<typeof setupUser>>['wallet'];

  before(async () => {
    ({ sdk, wallet, mint } = await setupUser());
    ({ sdk: recipientSdk, wallet: recipientWallet } = await setupUser(Keypair.generate()));
  });

  afterEach(async () => {
    await checkConservation();
  });

  it('user state exists', async () => {
    const state = await sdk.getUserState(wallet.publicKey);
    expect(state).to.not.be.null;
    expect(state.owner.toBase58()).to.equal(wallet.publicKey.toBase58());
  });

  it('user balance exists for mint', async () => {
    const bal = await sdk.getUserBalance(wallet.publicKey, mint);
    expect(bal).to.not.be.null;
    expect(bal.amount.toNumber()).to.be.greaterThan(0);
  });

  it('can deposit tokens', async () => {
    const before = await sdk.getUserBalance(wallet.publicKey, mint);
    const depositAmount = new BN(100_000);

    await sdk.deposit({ mint, amount: depositAmount });
    await sleep(500);

    const after = await sdk.getUserBalance(wallet.publicKey, mint);
    expect(after.amount.sub(before.amount).toNumber()).to.equal(depositAmount.toNumber());
  });

  it('can transfer batch', async () => {
    const recipient = recipientWallet.publicKey;
    const amount = new BN(10_000);

    const before = await sdk.getUserBalance(wallet.publicKey, mint);
    await sdk.transferBatchChunked(mint, [{ toOwner: recipient, amount, kind: 'user' }], 15);
    await sleep(500);

    const after = await sdk.getUserBalance(wallet.publicKey, mint);
    expect(before.amount.sub(after.amount).toNumber()).to.equal(amount.toNumber());
  });

  it('can withdraw tokens', async () => {
    const before = await sdk.getUserBalance(wallet.publicKey, mint);
    const withdrawAmount = new BN(50_000);

    await sdk.withdraw({ mint, amount: withdrawAmount });
    await sleep(500);

    const after = await sdk.getUserBalance(wallet.publicKey, mint);
    expect(before.amount.sub(after.amount).toNumber()).to.equal(withdrawAmount.toNumber());
  });
});
