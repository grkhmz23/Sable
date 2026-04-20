import { expect } from 'chai';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { setupUser, sleep } from './helpers/setup';
import { checkConservation } from './helpers/conservation';

describe('02-agents', () => {
  let sdk: Awaited<ReturnType<typeof setupUser>>['sdk'];
  let wallet: Awaited<ReturnType<typeof setupUser>>['wallet'];
  let mint: Awaited<ReturnType<typeof setupUser>>['mint'];
  let agent1: PublicKey;
  let agent2: PublicKey;

  before(async () => {
    ({ sdk, wallet, mint } = await setupUser());
  });

  afterEach(async () => {
    await checkConservation();
  });

  it('can spawn a top-level agent', async () => {
    const result = await sdk.agents.spawnAgent({
      parentKind: 'user',
      parent: wallet.publicKey,
      label: 'Test Agent 1',
    });
    agent1 = result.agent;
    await sleep(500);

    const info = await sdk.agents.getAgent(agent1);
    expect(info).to.not.be.null;
    expect(info!.label).to.equal('Test Agent 1');
    expect(info!.rootUser.toBase58()).to.equal(wallet.publicKey.toBase58());
  });

  it('can spawn a sub-agent', async () => {
    const result = await sdk.agents.spawnAgent({
      parentKind: 'agent',
      parent: agent1,
      label: 'Sub Agent 2',
    });
    agent2 = result.agent;
    await sleep(500);

    const info = await sdk.agents.getAgent(agent2);
    expect(info).to.not.be.null;
    expect(info!.parent.toBase58()).to.equal(agent1.toBase58());
  });

  it('can fund an agent', async () => {
    const amount = new BN(200_000);
    await sdk.agents.fundAgent({ agent: agent1, mint, amount });
    await sleep(500);

    const bal = await sdk.agents.getAgentBalance(agent1, mint);
    expect(bal).to.not.be.null;
    expect(bal.amount.toNumber()).to.equal(amount.toNumber());
  });

  it('can transfer from agent to user', async () => {
    const amount = new BN(50_000);
    const before = await sdk.getUserBalance(wallet.publicKey, mint);

    await sdk.agents.agentTransfer({
      agent: agent1,
      mint,
      to: wallet.publicKey,
      toKind: 'user',
      amount,
    });
    await sleep(500);

    const after = await sdk.getUserBalance(wallet.publicKey, mint);
    expect(after.amount.sub(before.amount).toNumber()).to.equal(amount.toNumber());
  });

  it('can defund an agent', async () => {
    const beforeAgent = await sdk.agents.getAgentBalance(agent1, mint);
    const amount = new BN(50_000);

    await sdk.agents.defundAgent({ agent: agent1, mint, amount });
    await sleep(500);

    const afterAgent = await sdk.agents.getAgentBalance(agent1, mint);
    expect(beforeAgent.amount.sub(afterAgent.amount).toNumber()).to.equal(amount.toNumber());
  });

  it('can close sub-agent', async () => {
    await sdk.agents.closeAgent({ agent: agent2 });
    await sleep(500);

    const info = await sdk.agents.getAgent(agent2);
    expect(info).to.be.null;
  });
});
