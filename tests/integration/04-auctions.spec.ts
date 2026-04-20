import { expect } from 'chai';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { setupUser, sleep } from './helpers/setup';
import { checkConservation } from './helpers/conservation';

describe('04-auctions', () => {
  let sdk: Awaited<ReturnType<typeof setupUser>>['sdk'];
  let wallet: Awaited<ReturnType<typeof setupUser>>['wallet'];
  let mint: Awaited<ReturnType<typeof setupUser>>['mint'];
  let task: PublicKey;
  const bidders: { pubkey: PublicKey; nonce: BN }[] = [];

  before(async () => {
    ({ sdk, wallet, mint } = await setupUser());
  });

  afterEach(async () => {
    await checkConservation();
  });

  it('can create a task', async () => {
    const result = await sdk.auctions.createTask({
      posterKind: 'user',
      poster: wallet.publicKey,
      mint,
      budget: new BN(100_000),
      minDeposit: new BN(1_000),
      specContent: 'Test task for integration',
      bidCommitSeconds: 3,
      bidRevealSeconds: 6,
    });
    task = result.task;
    await sleep(500);

    const info = await sdk.auctions.getTask(task);
    expect(info).to.not.be.null;
    expect(info!.budget.toNumber()).to.equal(100_000);
    expect(info!.state).to.equal('open');
  });

  it('can commit bids', async () => {
    const bidAmounts = [80_000, 70_000, 90_000];
    for (let i = 0; i < 3; i++) {
      const result = await sdk.auctions.commitBid({
        task,
        bidder: wallet.publicKey,
        bidderKind: 'user',
        amount: new BN(bidAmounts[i]),
        deposit: new BN(1_000),
      });
      bidders.push({ pubkey: wallet.publicKey, nonce: result.nonce });
      await sleep(200);
    }

    const info = await sdk.auctions.getTask(task);
    expect(info!.bidCount).to.equal(3);
  });

  it('can reveal bids after commit deadline', async () => {
    const info = await sdk.auctions.getTask(task);
    const now = Math.floor(Date.now() / 1000);
    const waitUntil = info!.bidCommitDeadline.toNumber() + 1;
    if (now < waitUntil) {
      await sleep((waitUntil - now) * 1000 + 500);
    }

    const bidAmounts = [80_000, 70_000, 90_000];
    for (let i = 0; i < 3; i++) {
      await sdk.auctions.revealBid({
        task,
        bidder: wallet.publicKey,
        amount: new BN(bidAmounts[i]),
        nonce: bidders[i].nonce,
      });
      await sleep(200);
    }
  });

  it('can settle auction after reveal deadline', async () => {
    const info = await sdk.auctions.getTask(task);
    const now = Math.floor(Date.now() / 1000);
    const waitUntil = info!.bidRevealDeadline.toNumber() + 1;
    if (now < waitUntil) {
      await sleep((waitUntil - now) * 1000 + 500);
    }

    const result = await sdk.auctions.settleAuction({ task });
    await sleep(500);

    expect(result.winner.toBase58()).to.equal(wallet.publicKey.toBase58());
    expect(result.winningAmount.toNumber()).to.equal(70_000);

    const updated = await sdk.auctions.getTask(task);
    expect(updated!.state).to.equal('settled');
  });
});
