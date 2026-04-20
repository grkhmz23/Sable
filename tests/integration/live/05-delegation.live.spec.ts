import { expect } from 'chai';
import { liveOnly } from './gate';
import { setupUser } from '../helpers/setup';

liveOnly('05-delegation (live)', () => {
  it('connects to live network', async () => {
    const { sdk, wallet } = await setupUser();
    const state = await sdk.getUserState(wallet.publicKey);
    expect(state).to.not.be.null;
  });
});
