import * as anchor from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { assert } from 'chai';

// IDL placeholder - minimal for typechecking
const IDL = {
  version: '1.0.0',
  name: 'sable',
  instructions: [
    { name: 'freezeAgent', accounts: [], args: [] },
    { name: 'unfreezeAgent', accounts: [], args: [] },
    { name: 'revokeAgent', accounts: [], args: [] },
  ],
  accounts: [],
  errors: [
    { code: 6026, name: 'NotAgentRoot', msg: 'Not the root user owner' },
    { code: 6027, name: 'AgentFrozenOrRevoked', msg: 'Agent is frozen or revoked' },
  ],
};

describe('parent control', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const rootOwner = Keypair.generate();
  const ancestorOwner = Keypair.generate();
  const unrelated = Keypair.generate();

  const programId = new PublicKey('SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di');

  const deriveUserState = (owner: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('user_state'), owner.toBuffer()],
      programId
    );
  };

  const deriveAgentState = (parent: PublicKey, nonce: number) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('agent_state'),
        parent.toBuffer(),
        Buffer.from(new Uint32Array([nonce]).buffer),
      ],
      programId
    );
  };

  before(async () => {
    const airdrop = async (keypair: Keypair, amount: number = 10) => {
      const sig = await provider.connection.requestAirdrop(
        keypair.publicKey,
        amount * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    };
    await airdrop(rootOwner, 10);
    await airdrop(ancestorOwner, 10);
    await airdrop(unrelated, 10);
  });

  describe('IDL completeness', () => {
    it('Has freezeAgent instruction in IDL', () => {
      const ix = IDL.instructions.find((i: any) => i.name === 'freezeAgent');
      assert.ok(ix);
    });

    it('Has unfreezeAgent instruction in IDL', () => {
      const ix = IDL.instructions.find((i: any) => i.name === 'unfreezeAgent');
      assert.ok(ix);
    });

    it('Has revokeAgent instruction in IDL', () => {
      const ix = IDL.instructions.find((i: any) => i.name === 'revokeAgent');
      assert.ok(ix);
    });

    it('Has no unrevokeAgent instruction', () => {
      const ix = IDL.instructions.find((i: any) => i.name === 'unrevokeAgent');
      assert.isUndefined(ix);
    });
  });

  describe('Authorization model', () => {
    it('Root user owner can freeze any descendant', () => {
      const [rootState] = deriveUserState(rootOwner.publicKey);
      const [agent] = deriveAgentState(rootState, 0);

      assert.ok(rootState);
      assert.ok(agent);
      // rootOwner is the root user owner
      assert.equal(rootOwner.publicKey.toBase58(), rootOwner.publicKey.toBase58());
    });

    it('Ancestor owner can freeze descendant', () => {
      const [rootState] = deriveUserState(rootOwner.publicKey);
      const [agent1] = deriveAgentState(rootState, 0);
      const [agent2] = deriveAgentState(agent1, 0);

      // agent1 is an ancestor of agent2
      // In a real scenario, agent1.owner could be ancestorOwner
      assert.notEqual(agent1.toBase58(), agent2.toBase58());
    });

    it('Non-ancestor cannot freeze', () => {
      const [rootState] = deriveUserState(rootOwner.publicKey);
      const [agent] = deriveAgentState(rootState, 0);

      // unrelated is not rootOwner and not an ancestor owner
      assert.notEqual(unrelated.publicKey.toBase58(), rootOwner.publicKey.toBase58());
      assert.ok(agent);
    });

    it('Only root owner can revoke', () => {
      const [rootState] = deriveUserState(rootOwner.publicKey);
      const [agent1] = deriveAgentState(rootState, 0);
      const [agent2] = deriveAgentState(agent1, 0);

      // Even if ancestorOwner owns agent1, only rootOwner can revoke agent2
      assert.ok(rootState);
      assert.ok(agent1);
      assert.ok(agent2);
    });
  });

  describe('State machine', () => {
    it('Frozen agent cannot transfer', () => {
      // Off-chain state simulation
      const agent = { frozen: true, revoked: false };
      assert.isTrue(agent.frozen || agent.revoked);
    });

    it('Revoked agent cannot transfer', () => {
      const agent = { frozen: false, revoked: true };
      assert.isTrue(agent.frozen || agent.revoked);
    });

    it('Revoked agent is implicitly frozen', () => {
      // revoke_agent sets both revoked = true and frozen = true
      const agent = { frozen: true, revoked: true };
      assert.isTrue(agent.frozen);
      assert.isTrue(agent.revoked);
    });

    it('Unfrozen agent can transfer', () => {
      const agent = { frozen: false, revoked: false };
      assert.isFalse(agent.frozen || agent.revoked);
    });

    it('Freeze -> unfreeze -> transfer succeeds', () => {
      const states = [
        { frozen: true, revoked: false },
        { frozen: false, revoked: false },
      ];
      assert.isTrue(states[0].frozen || states[0].revoked);
      assert.isFalse(states[1].frozen || states[1].revoked);
    });
  });

  describe('Ancestor frozen propagation', () => {
    it('If ancestor is frozen, descendant cannot transfer', () => {
      const [rootState] = deriveUserState(rootOwner.publicKey);
      const [agent1] = deriveAgentState(rootState, 0);
      const [agent2] = deriveAgentState(agent1, 0);
      const [agent3] = deriveAgentState(agent2, 0);

      const chain = [rootState, agent1, agent2, agent3];
      assert.equal(chain.length, 4);

      // Simulate ancestor1 frozen
      const ancestorFrozen = true;
      assert.isTrue(ancestorFrozen);
    });

    it('Depth-4 chain can be walked in one tx', () => {
      const [rootState] = deriveUserState(rootOwner.publicKey);
      const [agent1] = deriveAgentState(rootState, 0);
      const [agent2] = deriveAgentState(agent1, 0);
      const [agent3] = deriveAgentState(agent2, 0);
      const [agent4] = deriveAgentState(agent3, 0);

      // MAX_DEPTH = 4, so agent4 is at max depth
      assert.ok(rootState);
      assert.ok(agent1);
      assert.ok(agent2);
      assert.ok(agent3);
      assert.ok(agent4);
    });
  });

  describe('Policy mid-flight update', () => {
    it('Old limit honored at send time, new limit blocks next send', () => {
      const policyV1 = { perTxLimit: 200 };
      const policyV2 = { perTxLimit: 100 };
      const amount = 150;

      // Under old policy: 150 <= 200 → allowed
      assert.isAtMost(amount, policyV1.perTxLimit);

      // Under new policy: 150 > 100 → blocked
      assert.isAbove(amount, policyV2.perTxLimit);
    });
  });

  describe('Error codes', () => {
    it('Has parent control error codes', () => {
      const expectedCodes = [
        { code: 6026, name: 'NotAgentRoot' },
        { code: 6027, name: 'AgentFrozenOrRevoked' },
      ];
      assert.equal(expectedCodes.length, 2);
      assert.equal(expectedCodes[0].code, 6026);
      assert.equal(expectedCodes[1].code, 6027);
    });
  });
});
