import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { assert } from 'chai';
import { SableClient } from '../src/client';
import { PROGRAM_ID_DEVNET } from '@sable/common';

describe('SDK Delegation', () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const payer = provider.wallet as anchor.Wallet;
  let client: SableClient;
  const mint = new PublicKey('So11111111111111111111111111111111111111112');

  before(async () => {
    client = new SableClient({
      programId: PROGRAM_ID_DEVNET,
      connection: provider.connection,
      wallet: payer,
    });

    // Ensure user is set up
    try {
      await client.join();
    } catch {
      // May already exist
    }
  });

  it('delegation status reflects non-delegated initially', async () => {
    const status = await client.getDelegationStatus(payer.publicKey, [mint]);
    assert.equal(status.length, 2); // userState + userBalance
    assert.isFalse(status[0].isDelegated);
  });

  it('hasDelegatedAccounts returns false initially', async () => {
    const hasDelegated = await client.hasDelegatedAccounts(payer.publicKey, [mint]);
    assert.isFalse(hasDelegated);
  });

  // NOTE: Full delegate + commit/undelegate round-trip requires:
  // 1. The MagicBlock delegation program deployed on the local validator
  // 2. The Sable program deployed with matching program ID
  // 3. Sufficient compute budget for delegation CPI
  //
  // When those preconditions are met, uncomment below:
  //
  // it('delegate marks accounts as delegated', async () => {
  //   await client.delegate({ mintList: [mint] });
  //   const status = await client.getDelegationStatus(payer.publicKey, [mint]);
  //   assert.isTrue(status.every(s => s.isDelegated));
  // });
  //
  // it('commitAndUndelegate marks accounts as non-delegated', async () => {
  //   await client.commitAndUndelegate({ mintList: [mint] });
  //   const status = await client.getDelegationStatus(payer.publicKey, [mint]);
  //   assert.isFalse(status.every(s => s.isDelegated));
  // });
});
