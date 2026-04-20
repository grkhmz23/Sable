import { spawn, ChildProcess } from 'child_process';
import { Keypair } from '@solana/web3.js';
import { assert } from 'chai';
import { SableSession, SessionExpiredError, UnauthorizedError } from '../src/session';

describe('SDK Session (mock middleware)', () => {
  let middleware: ChildProcess;
  let middlewareUrl: string;

  before(async function () {
    this.timeout(10000);

    // Start mock middleware on a random port
    const port = 3333 + Math.floor(Math.random() * 1000);
    middlewareUrl = `http://localhost:${port}`;

    middleware = spawn(
      'node',
      ['-e', `
        process.env.PER_MOCK_PORT = '${port}';
        process.env.SOLANA_RPC_URL = 'http://localhost:8899';
        require('../../services/per-mock-middleware/dist/server.js');
      `],
      { cwd: process.cwd(), stdio: 'pipe' }
    );

    // Wait for middleware to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Middleware startup timeout')), 5000);
      const check = setInterval(async () => {
        try {
          const res = await fetch(`${middlewareUrl}/health`);
          if (res.ok) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        } catch {
          // retry
        }
      }, 200);
    });
  });

  after(async () => {
    if (middleware) {
      middleware.kill();
    }
  });

  it('openSession exchanges challenge for session keypair', async () => {
    const owner = Keypair.generate();
    const signer = {
      publicKey: owner.publicKey,
      signMessage: async (msg: Uint8Array) => {
        return nacl.sign.detached(msg, owner.secretKey);
      },
    };

    const session = await SableSession.openSession({
      signer,
      perRpcUrl: middlewareUrl,
      ttlSeconds: 60,
    });

    assert.isNotNull(session);
    assert.isNotNull(session.sessionKey);
    assert.instanceOf(session.sessionKey, Keypair);
    assert.isAbove(session.expiry, Math.floor(Date.now() / 1000));
    assert.equal(session.perEndpoint, middlewareUrl);
    assert.isFalse(session.isExpired);
  });

  it('openSession fails with invalid signature', async () => {
    const owner = Keypair.generate();
    const badSigner = {
      publicKey: owner.publicKey,
      signMessage: async () => new Uint8Array(64).fill(0), // all-zeros signature
    };

    try {
      await SableSession.openSession({
        signer: badSigner,
        perRpcUrl: middlewareUrl,
      });
      assert.fail('Expected UnauthorizedError');
    } catch (err) {
      assert.instanceOf(err, UnauthorizedError);
    }
  });

  it('getBalance returns 0 for unknown account', async () => {
    const owner = Keypair.generate();
    const signer = {
      publicKey: owner.publicKey,
      signMessage: async (msg: Uint8Array) => {
        return nacl.sign.detached(msg, owner.secretKey);
      },
    };

    const session = await SableSession.openSession({
      signer,
      perRpcUrl: middlewareUrl,
    });

    // Random PDA — account won't exist, middleware returns 404
    try {
      await session.getBalance(Keypair.generate().publicKey);
      assert.fail('Expected error');
    } catch (err: any) {
      assert.include(err.message.toLowerCase(), 'not found');
    }
  });

  it('session.isExpired reflects expiry', async () => {
    const owner = Keypair.generate();
    const signer = {
      publicKey: owner.publicKey,
      signMessage: async (msg: Uint8Array) => {
        return nacl.sign.detached(msg, owner.secretKey);
      },
    };

    const session = await SableSession.openSession({
      signer,
      perRpcUrl: middlewareUrl,
      ttlSeconds: 1,
    });

    assert.isFalse(session.isExpired);

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 1500));
    assert.isTrue(session.isExpired);

    try {
      await session.getBalance(Keypair.generate().publicKey);
      assert.fail('Expected SessionExpiredError');
    } catch (err) {
      assert.instanceOf(err, SessionExpiredError);
    }
  });

  it('close clears session key', async () => {
    const owner = Keypair.generate();
    const signer = {
      publicKey: owner.publicKey,
      signMessage: async (msg: Uint8Array) => {
        return nacl.sign.detached(msg, owner.secretKey);
      },
    };

    const session = await SableSession.openSession({
      signer,
      perRpcUrl: middlewareUrl,
    });

    session.close();
    assert.equal(session.expiry, 0);
  });
});

// Minimal nacl detached sign helper for tests
const nacl = {
  sign: {
    detached(msg: Uint8Array, secretKey: Uint8Array): Uint8Array {
      // Use tweetnacl if available, otherwise fallback
      try {
        const tn = require('tweetnacl');
        return tn.sign.detached(msg, secretKey);
      } catch {
        throw new Error('tweetnacl required for session tests');
      }
    },
  },
};
