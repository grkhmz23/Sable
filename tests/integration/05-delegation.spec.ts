import { expect } from 'chai';
import { setupUser, sleep } from './helpers/setup';
import { checkConservation } from './helpers/conservation';

describe('05-delegation', () => {
  let sdk: Awaited<ReturnType<typeof setupUser>>['sdk'];
  let wallet: Awaited<ReturnType<typeof setupUser>>['wallet'];
  let mint: Awaited<ReturnType<typeof setupUser>>['mint'];

  before(async () => {
    ({ sdk, wallet, mint } = await setupUser());
  });

  afterEach(async () => {
    await checkConservation();
  });

  it('can delegate user state and balances', async () => {
    await sdk.delegate({ mintList: [mint] });
    await sleep(500);

    const status = await sdk.getDelegationStatus(wallet.publicKey, [mint]);
    const userStateStatus = status.find((s) =>
      s.account.equals(sdk.pda.deriveUserState(wallet.publicKey)[0])
    );
    expect(userStateStatus?.isDelegated).to.be.true;
  });

  it('can commit and undelegate', async () => {
    await sdk.commitAndUndelegate({ mintList: [mint] });
    await sleep(500);

    const status = await sdk.getDelegationStatus(wallet.publicKey, [mint]);
    const userStateStatus = status.find((s) =>
      s.account.equals(sdk.pda.deriveUserState(wallet.publicKey)[0])
    );
    expect(userStateStatus?.isDelegated).to.be.false;
  });
});
