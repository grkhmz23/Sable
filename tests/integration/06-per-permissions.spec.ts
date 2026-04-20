import { expect } from 'chai';
import { setupUser, sleep, getPda } from './helpers/setup';
import { checkConservation } from './helpers/conservation';
import { PERMISSION_PROGRAM_ID } from '@sable/sdk';

describe('06-per-permissions', () => {
  let sdk: Awaited<ReturnType<typeof setupUser>>['sdk'];
  let wallet: Awaited<ReturnType<typeof setupUser>>['wallet'];
  let mint: Awaited<ReturnType<typeof setupUser>>['mint'];

  before(async () => {
    ({ sdk, wallet, mint } = await setupUser());
  });

  afterEach(async () => {
    await checkConservation();
  });

  it('auto-created PER permission for user balance', async () => {
    const [userBalance] = getPda().deriveUserBalance(wallet.publicKey, mint);
    const [permission] = getPda().derivePermission(userBalance);

    const account = await sdk.config.connection.getAccountInfo(permission);
    expect(account).to.not.be.null;
    expect(account!.owner.toBase58()).to.equal(PERMISSION_PROGRAM_ID.toBase58());
  });
});
