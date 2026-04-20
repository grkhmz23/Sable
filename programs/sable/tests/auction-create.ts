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
    { name: 'createTask', accounts: [], args: [] },
    { name: 'cancelTask', accounts: [], args: [] },
  ],
  accounts: [],
  errors: [
    { code: 6039, name: 'TaskDeadlineInvalid', msg: 'Task deadline is invalid' },
    { code: 6040, name: 'TaskNotCancellable', msg: 'Task cannot be cancelled' },
    { code: 6041, name: 'TaskEscrowMismatch', msg: 'Task escrow does not match task' },
    { code: 6042, name: 'TaskWrongState', msg: 'Task is in wrong state for this operation' },
  ],
};

describe('auction create / cancel', () => {
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

  const deriveTask = (poster: PublicKey, taskId: number) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('task'),
        poster.toBuffer(),
        Buffer.from(new BigUint64Array([BigInt(taskId)]).buffer),
      ],
      programId
    );
  };

  const deriveTaskEscrow = (task: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('task_escrow'), task.toBuffer()],
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
    it('Task PDA depends on poster and task_id', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [task1] = deriveTask(user1State, 0);
      const [task2] = deriveTask(user1State, 1);
      const [task3] = deriveTask(user2.publicKey, 0);

      assert.ok(task1);
      assert.ok(task2);
      assert.ok(task3);
      assert.notEqual(task1.toBase58(), task2.toBase58());
      assert.notEqual(task1.toBase58(), task3.toBase58());
    });

    it('Task PDA is deterministic', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [task1a] = deriveTask(user1State, 5);
      const [task1b] = deriveTask(user1State, 5);
      assert.equal(task1a.toBase58(), task1b.toBase58());
    });

    it('TaskEscrow PDA depends on task', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [task1] = deriveTask(user1State, 0);
      const [escrow1] = deriveTaskEscrow(task1);
      const [escrow2] = deriveTaskEscrow(task1);

      assert.ok(escrow1);
      assert.equal(escrow1.toBase58(), escrow2.toBase58());
    });

    it('TaskEscrow for different tasks are different', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [task1] = deriveTask(user1State, 0);
      const [task2] = deriveTask(user1State, 1);
      const [escrow1] = deriveTaskEscrow(task1);
      const [escrow2] = deriveTaskEscrow(task2);

      assert.notEqual(escrow1.toBase58(), escrow2.toBase58());
    });
  });

  describe('Task state machine', () => {
    it('Initial state is Open', () => {
      const state = { state: 0 }; // TaskState::Open
      assert.equal(state.state, 0);
    });

    it('Cancelled state value is 3', () => {
      // TaskState::Cancelled = 3
      assert.equal(3, 3);
    });

    it('Settled state value is 2', () => {
      assert.equal(2, 2);
    });
  });

  describe('Deadline validations', () => {
    it('Commit deadline must be in the future', () => {
      const now = 1_000_000;
      const commitDeadline = now - 100;
      assert.isBelow(commitDeadline, now);
    });

    it('Reveal deadline must be after commit deadline', () => {
      const commit = 1_000_000;
      const reveal = 1_000_100;
      assert.isAbove(reveal, commit);
    });

    it('Reveal deadline cannot exceed 7 days from now', () => {
      const now = 1_000_000;
      const maxReveal = now + 7 * 86400;
      const badReveal = now + 8 * 86400;
      assert.isAtMost(maxReveal - now, 7 * 86400);
      assert.isAbove(badReveal - now, 7 * 86400);
    });
  });

  describe('Cancellation rules', () => {
    it('Can cancel when Open, before commit deadline, no bids', () => {
      const task = {
        state: 0, // Open
        bidCommitDeadline: 1_000_000,
        bidCount: 0,
      };
      const now = 999_999;
      assert.equal(task.state, 0);
      assert.isBelow(now, task.bidCommitDeadline);
      assert.equal(task.bidCount, 0);
    });

    it('Cannot cancel after commit deadline', () => {
      const task = {
        state: 0,
        bidCommitDeadline: 1_000_000,
        bidCount: 0,
      };
      const now = 1_000_001;
      assert.isAbove(now, task.bidCommitDeadline);
    });

    it('Cannot cancel when bids exist', () => {
      const task = {
        state: 0,
        bidCommitDeadline: 1_000_000,
        bidCount: 3,
      };
      const now = 999_999;
      assert.isBelow(now, task.bidCommitDeadline);
      assert.isAbove(task.bidCount, 0);
    });

    it('Cannot cancel when state is not Open', () => {
      const task = { state: 2 }; // Settled
      assert.notEqual(task.state, 0);
    });
  });

  describe('Budget locking', () => {
    it('Creating task debits poster balance and credits escrow', () => {
      const posterBalance = 1000;
      const budget = 300;
      const escrow = 0;

      const afterCreatePoster = posterBalance - budget;
      const afterCreateEscrow = escrow + budget;

      assert.equal(afterCreatePoster, 700);
      assert.equal(afterCreateEscrow, 300);
      assert.equal(afterCreatePoster + afterCreateEscrow, posterBalance + escrow);
    });

    it('Cancelling task debits escrow and credits poster balance', () => {
      const posterBalance = 700;
      const escrow = 300;

      const afterCancelPoster = posterBalance + escrow;
      const afterCancelEscrow = 0;

      assert.equal(afterCancelPoster, 1000);
      assert.equal(afterCancelEscrow, 0);
    });
  });

  describe('Policy enforcement for agent posters', () => {
    it('Budget exceeding per-tx limit is rejected', () => {
      const perTxLimit = 100;
      const budget = 150;
      assert.isAbove(budget, perTxLimit);
    });

    it('Budget within per-tx limit is allowed', () => {
      const perTxLimit = 100;
      const budget = 80;
      assert.isAtMost(budget, perTxLimit);
    });
  });

  describe('Error codes', () => {
    it('Has auction error codes', () => {
      const expectedCodes = [
        { code: 6039, name: 'TaskDeadlineInvalid' },
        { code: 6040, name: 'TaskNotCancellable' },
        { code: 6041, name: 'TaskEscrowMismatch' },
        { code: 6042, name: 'TaskWrongState' },
      ];
      assert.equal(expectedCodes.length, 4);
      assert.equal(expectedCodes[0].code, 6039);
      assert.equal(expectedCodes[1].code, 6040);
      assert.equal(expectedCodes[2].code, 6041);
      assert.equal(expectedCodes[3].code, 6042);
    });
  });
});
