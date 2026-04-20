import { expect } from 'chai';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { X402Client } from '@sable/x402-client';
import { setupUser, sleep } from './helpers/setup';
import { checkConservation } from './helpers/conservation';

describe('07-x402', () => {
  let sdk: Awaited<ReturnType<typeof setupUser>>['sdk'];
  let wallet: Awaited<ReturnType<typeof setupUser>>['wallet'];
  let mint: Awaited<ReturnType<typeof setupUser>>['mint'];
  let agent: PublicKey;

  before(async () => {
    ({ sdk, wallet, mint } = await setupUser());
    const result = await sdk.agents.spawnAgent({
      parentKind: 'user',
      parent: wallet.publicKey,
      label: 'x402 Demo Agent',
    });
    agent = result.agent;
    await sdk.agents.fundAgent({ agent, mint, amount: new BN(1_000_000) });
    await sleep(500);
  });

  afterEach(async () => {
    await checkConservation();
  });

  it('can call weather API via x402 payment', async () => {
    const x402 = new X402Client({ sableClient: sdk, agent });
    const city = 'Barcelona';
    const receiver = wallet.publicKey.toBase58();

    const res = await x402.fetch(
      `http://localhost:3000/api/demo/weather?city=${encodeURIComponent(city)}&receiver=${receiver}`
    );

    expect(res.status).to.equal(200);
    const data = await res.json();
    expect(data.city).to.equal(city);
    expect(data.temp).to.be.a('number');
  });
});
