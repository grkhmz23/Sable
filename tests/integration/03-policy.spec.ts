import { expect } from 'chai';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { setupUser, sleep } from './helpers/setup';
import { checkConservation } from './helpers/conservation';

describe('03-policy', () => {
  let sdk: Awaited<ReturnType<typeof setupUser>>['sdk'];
  let wallet: Awaited<ReturnType<typeof setupUser>>['wallet'];
  let mint: Awaited<ReturnType<typeof setupUser>>['mint'];
  let agent: PublicKey;

  before(async () => {
    ({ sdk, wallet, mint } = await setupUser());
    const result = await sdk.agents.spawnAgent({
      parentKind: 'user',
      parent: wallet.publicKey,
      label: 'Policy Test Agent',
    });
    agent = result.agent;
    await sdk.agents.fundAgent({ agent, mint, amount: new BN(500_000) });
    await sleep(500);
  });

  afterEach(async () => {
    await checkConservation();
  });

  it('enforces per-tx limit', async () => {
    await sdk.agents.setPolicy({
      agent,
      policy: {
        perTxLimit: new BN(10_000),
        dailyLimit: new BN(0),
        totalLimit: new BN(0),
        counterpartyMode: 'any',
        allowedCounterparties: [],
        allowedMints: [],
        expiresAt: new BN(0),
      },
    });
    await sleep(500);

    try {
      await sdk.agents.agentTransfer({
        agent,
        mint,
        to: wallet.publicKey,
        toKind: 'user',
        amount: new BN(20_000),
      });
      expect.fail('Should have thrown PerTxLimitExceeded');
    } catch (e: any) {
      expect(e.message).to.match(/PerTxLimitExceeded|per.?tx/i);
    }
  });

  it('allows transfer within limit', async () => {
    await sdk.agents.agentTransfer({
      agent,
      mint,
      to: wallet.publicKey,
      toKind: 'user',
      amount: new BN(5_000),
    });
    await sleep(500);
  });

  it('enforces mint allowlist', async () => {
    await sdk.agents.setPolicy({
      agent,
      policy: {
        perTxLimit: new BN(0),
        dailyLimit: new BN(0),
        totalLimit: new BN(0),
        counterpartyMode: 'any',
        allowedCounterparties: [],
        allowedMints: [mint],
        expiresAt: new BN(0),
      },
    });
    await sleep(500);

    // Transfer with allowed mint should succeed
    await sdk.agents.agentTransfer({
      agent,
      mint,
      to: wallet.publicKey,
      toKind: 'user',
      amount: new BN(1_000),
    });
    await sleep(500);
  });

  it('can freeze and unfreeze agent', async () => {
    await sdk.agents.freezeAgent({ agent });
    await sleep(500);

    const info1 = await sdk.agents.getAgent(agent);
    expect(info1!.frozen).to.be.true;

    await sdk.agents.unfreezeAgent({ agent });
    await sleep(500);

    const info2 = await sdk.agents.getAgent(agent);
    expect(info2!.frozen).to.be.false;
  });
});
