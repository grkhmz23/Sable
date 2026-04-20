import { expect } from 'chai';
import { liveOnly } from './gate';
import { setupUser } from '../helpers/setup';

liveOnly('01-treasury (live)', () => {
  it('connects to live network and user exists', async () => {
    const { sdk, wallet } = await setupUser();
    const state = await sdk.getUserState(wallet.publicKey);
    expect(state).to.not.be.null;
  });
});
