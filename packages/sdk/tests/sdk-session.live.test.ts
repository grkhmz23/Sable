/**
 * Live PER Session Tests
 *
 * These tests run against the real MagicBlock PER middleware endpoint.
 * Gated behind SABLE_RUN_LIVE_TESTS=1 — they do NOT run in CI by default.
 *
 * To run locally (requires credentials):
 *   SABLE_RUN_LIVE_TESTS=1 SABLE_PER_RPC_URL=<url> pnpm test sdk-session.live
 */

import { Keypair } from '@solana/web3.js';
import { assert } from 'chai';
import { SableSession, UnauthorizedError } from '../src/session';

const RUN_LIVE = process.env.SABLE_RUN_LIVE_TESTS === '1';
const PER_RPC_URL = process.env.SABLE_PER_RPC_URL || '';

describe('SDK Session (LIVE)', function () {
  if (!RUN_LIVE) {
    it.skip('Live tests disabled. Set SABLE_RUN_LIVE_TESTS=1 to enable.', () => {});
    return;
  }

  if (!PER_RPC_URL) {
    it.skip('SABLE_PER_RPC_URL not set. Skipping live tests.', () => {});
    return;
  }

  this.timeout(30000);

  it('openSession against live MagicBlock PER endpoint', async () => {
    const owner = Keypair.generate();
    const signer = {
      publicKey: owner.publicKey,
      signMessage: async (msg: Uint8Array) => {
        const tn = require('tweetnacl');
        return tn.sign.detached(msg, owner.secretKey);
      },
    };

    const session = await SableSession.openSession({
      signer,
      perRpcUrl: PER_RPC_URL,
      ttlSeconds: 300,
    });

    assert.isNotNull(session);
    assert.isNotNull(session.sessionKey);
    assert.isFalse(session.isExpired);
  });

  it('getBalance on delegated account via live endpoint', async () => {
    // This test requires a real delegated balance PDA on PER.
    // The caller must set SABLE_TEST_BALANCE_PDA to a known delegated account.
    const balancePda = process.env.SABLE_TEST_BALANCE_PDA;
    if (!balancePda) {
      console.log('SABLE_TEST_BALANCE_PDA not set — skipping live balance read');
      return;
    }

    const owner = Keypair.generate();
    const signer = {
      publicKey: owner.publicKey,
      signMessage: async (msg: Uint8Array) => {
        const tn = require('tweetnacl');
        return tn.sign.detached(msg, owner.secretKey);
      },
    };

    const session = await SableSession.openSession({
      signer,
      perRpcUrl: PER_RPC_URL,
    });

    const balance = await session.getBalance(new PublicKey(balancePda));
    assert.isTrue(balance.gte(new BN(0)));
  });

  it('getBalance on non-delegated account fails with Unauthorized', async () => {
    const owner = Keypair.generate();
    const signer = {
      publicKey: owner.publicKey,
      signMessage: async (msg: Uint8Array) => {
        const tn = require('tweetnacl');
        return tn.sign.detached(msg, owner.secretKey);
      },
    };

    const session = await SableSession.openSession({
      signer,
      perRpcUrl: PER_RPC_URL,
    });

    try {
      // Random PDA should not be readable without delegation
      await session.getBalance(Keypair.generate().publicKey);
      assert.fail('Expected UnauthorizedError');
    } catch (err) {
      assert.instanceOf(err, UnauthorizedError);
    }
  });
});

import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
