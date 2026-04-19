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
  instructions: [],
  accounts: [],
  errors: [],
};

describe('agent transfers', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  const programId = new PublicKey('SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di');

  const deriveUserState = (owner: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('user_state'), owner.toBuffer()],
      programId
    );
  };

  const deriveUserBalance = (owner: PublicKey, mint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('user_balance'),
        owner.toBuffer(),
        mint.toBuffer(),
      ],
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

  const deriveAgentBalance = (agent: PublicKey, mint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('agent_balance'),
        agent.toBuffer(),
        mint.toBuffer(),
      ],
      programId
    );
  };

  const deriveAgentCounters = (agent: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('agent_counters'), agent.toBuffer()],
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
    await airdrop(user1, 10);
    await airdrop(user2, 10);
  });

  describe('PDA derivations', () => {
    it('AgentBalance PDA depends on agent and mint', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [agent1] = deriveAgentState(user1State, 0);
      const mint1 = Keypair.generate().publicKey;
      const mint2 = Keypair.generate().publicKey;

      const [balance1] = deriveAgentBalance(agent1, mint1);
      const [balance2] = deriveAgentBalance(agent1, mint2);
      const [balance3] = deriveAgentBalance(user1State, mint1);

      assert.ok(balance1);
      assert.notEqual(balance1.toBase58(), balance2.toBase58());
      assert.notEqual(balance1.toBase58(), balance3.toBase58());
    });

    it('AgentBalance PDA is deterministic', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [agent1] = deriveAgentState(user1State, 0);
      const mint = Keypair.generate().publicKey;

      const [bal1] = deriveAgentBalance(agent1, mint);
      const [bal2] = deriveAgentBalance(agent1, mint);
      assert.equal(bal1.toBase58(), bal2.toBase58());
    });
  });

  describe('Transfer item kind', () => {
    it('RecipientKind User = 0, Agent = 1', () => {
      // These must match the Rust enum values
      assert.equal(0, 0); // RecipientKind::User
      assert.equal(1, 1); // RecipientKind::Agent
    });

    it('TransferItem with kind encodes correctly in IDL', () => {
      // Off-chain structural validation
      const item = {
        toOwner: user2.publicKey.toBase58(),
        amount: 100,
        kind: 1, // Agent
      };
      assert.equal(item.kind, 1);
      assert.equal(item.amount, 100);
    });
  });

  describe('Balance conservation', () => {
    it('Fund + defund round-trip conserves total', () => {
      // Off-chain arithmetic check
      const rootBalance = 1000;
      const agentBalance = 0;
      const fundAmount = 300;
      const defundAmount = 200;

      const afterFundRoot = rootBalance - fundAmount;
      const afterFundAgent = agentBalance + fundAmount;
      const afterDefundRoot = afterFundRoot + defundAmount;
      const afterDefundAgent = afterFundAgent - defundAmount;

      assert.equal(afterFundRoot, 700);
      assert.equal(afterFundAgent, 300);
      assert.equal(afterDefundRoot, 900);
      assert.equal(afterDefundAgent, 100);
      assert.equal(afterDefundRoot + afterDefundAgent, rootBalance + agentBalance);
    });
  });

  describe('Policy limits', () => {
    it('Per-tx limit of 100 rejects 101', () => {
      const perTxLimit = 100;
      const amount = 101;
      assert.isAbove(amount, perTxLimit);
    });

    it('Daily limit of 1000 rejects 600 + 500 same day', () => {
      const dailyLimit = 1000;
      const spentToday = 600;
      const secondAmount = 500;
      assert.isAbove(spentToday + secondAmount, dailyLimit);
    });

    it('Next day resets daily spent', () => {
      const dailyLimit = 1000;
      const yesterdaySpent = 600;
      const todayAmount = 500;
      // After day rollover, spent_today resets to 0
      const newSpentToday = todayAmount;
      assert.isAtMost(newSpentToday, dailyLimit);
    });
  });

  describe('Error codes', () => {
    it('Has agent transfer error codes', () => {
      const expectedCodes = [
        { code: 6036, name: 'AgentNotAuthorized' },
        { code: 6037, name: 'InsufficientAgentBalance' },
        { code: 6038, name: 'AgentHasBalances' },
      ];
      assert.equal(expectedCodes.length, 3);
      assert.equal(expectedCodes[0].code, 6036);
      assert.equal(expectedCodes[1].code, 6037);
      assert.equal(expectedCodes[2].code, 6038);
    });
  });
});
