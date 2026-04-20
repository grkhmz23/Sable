const express = require('express');
const anchor = require('@coral-xyz/anchor');
const { BN } = anchor;
const { Keypair, PublicKey, LAMPORTS_PER_SOL, SYSVAR_CLOCK_PUBKEY } = require('@solana/web3.js');
const {
  createMint,
  mintTo,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  createInitializeMintInstruction,
} = require('@solana/spl-token');
const { assert } = require('chai');
const { SableClient } = require('@sable/sdk');
const { PROGRAM_ID_DEVNET } = require('@sable/common');
const { sableX402 } = require('../dist/middleware');
const { decodePaymentHeader } = require('../dist/protocol');
const { SableAdapter } = require('../dist/sable-adapter');
const http = require('http');

/**
 * x402 E2E Test
 *
 * Tests the full flow: agent → merchant → 402 → paid → 200
 * Uses the local Sable program via AnchorProvider.local().
 */

function buildPaymentPayload(
  requirements: any,
  sableClient: any,
  agent: PublicKey,
  recipientKind: 'user' | 'agent'
): Promise<{ header: string; payload: any }> {
  return new Promise(async (resolve: any, reject: any) => {
    try {
      const option = requirements.accepts[0];
      const amount = new BN(option.maxAmountRequired);
      const mint = new PublicKey(option.asset);
      const receiver = new PublicKey(option.payTo);

      const tx = await sableClient.program.methods
        .agentTransfer(
          amount,
          receiver,
          recipientKind === 'user' ? { user: {} } : { agent: {} }
        )
        .accounts({
          agentOwner: sableClient.walletPublicKey,
          agent,
          agentBalance: sableClient.pda.deriveAgentBalance(agent, mint)[0],
          agentCounters: sableClient.pda.deriveAgentCounters(agent)[0],
          dest:
            recipientKind === 'user'
              ? sableClient.pda.deriveUserBalance(receiver, mint)[0]
              : sableClient.pda.deriveAgentBalance(receiver, mint)[0],
          mint,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .transaction();

      const { blockhash } = await sableClient.config.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = sableClient.walletPublicKey;

      const signed = await sableClient.config.wallet.signTransaction(tx);

      const payload = {
        x402Version: requirements.x402Version,
        scheme: option.scheme,
        network: option.network,
        serializedTransaction: signed.serialize().toString('base64'),
      };

      const header = Buffer.from(JSON.stringify(payload)).toString('base64');
      resolve({ header, payload });
    } catch (e: any) {
      reject(e);
    }
  });
}

describe('x402 E2E (local validator)', () => {
  let merchantClient: any;
  let agentOwnerClient: any;
  let mint: PublicKey;
  let agent: PublicKey;
  let merchantApp: any;
  let merchantServer: any;
  let merchantUrl: string;
  let facilitatorApp: any;
  let facilitatorServer: any;
  let facilitatorUrl: string;

  before(async function () {
    this.timeout(60000);

    // Check if local validator is running
    try {
      const conn = new (require('@solana/web3.js').Connection)('http://localhost:8899');
      await conn.getSlot();
    } catch {
      console.log('Skipping x402 E2E: local validator not running at http://localhost:8899');
      console.log('Start it with: solana-test-validator');
      this.skip();
      return;
    }

    const provider = anchor.AnchorProvider.local();
    anchor.setProvider(provider);
    const payer = provider.wallet;

    // Create a test SPL mint with 9 decimals
    const mintKeypair = Keypair.generate();
    const lamports = await getMinimumBalanceForRentExemptMint(provider.connection);
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: anchor.utils.token.TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(mintKeypair.publicKey, 9, payer.publicKey, null)
    );
    await provider.sendAndConfirm(tx, [mintKeypair]);
    mint = mintKeypair.publicKey;

    // Create merchant client
    const merchantKeypair = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(merchantKeypair.publicKey, LAMPORTS_PER_SOL)
    );
    merchantClient = new SableClient({
      programId: PROGRAM_ID_DEVNET,
      connection: provider.connection,
      wallet: {
        publicKey: merchantKeypair.publicKey,
        signTransaction: async (tx: any) => {
          tx.partialSign(merchantKeypair);
          return tx;
        },
        signAllTransactions: async (txs: any[]) => {
          txs.forEach((tx: any) => tx.partialSign(merchantKeypair));
          return txs;
        },
        signMessage: async (msg: Uint8Array) => {
          const nacl = require('tweetnacl');
          return nacl.sign.detached(msg, merchantKeypair.secretKey);
        },
      },
    });
    await merchantClient.join();
    await merchantClient.completeSetup([mint]);

    // Create agent owner client
    const agentOwnerKeypair = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(agentOwnerKeypair.publicKey, LAMPORTS_PER_SOL)
    );
    agentOwnerClient = new SableClient({
      programId: PROGRAM_ID_DEVNET,
      connection: provider.connection,
      wallet: {
        publicKey: agentOwnerKeypair.publicKey,
        signTransaction: async (tx: any) => {
          tx.partialSign(agentOwnerKeypair);
          return tx;
        },
        signAllTransactions: async (txs: any[]) => {
          txs.forEach((tx: any) => tx.partialSign(agentOwnerKeypair));
          return txs;
        },
        signMessage: async (msg: Uint8Array) => {
          const nacl = require('tweetnacl');
          return nacl.sign.detached(msg, agentOwnerKeypair.secretKey);
        },
      },
    });
    await agentOwnerClient.join();
    await agentOwnerClient.completeSetup([mint]);

    // Deposit tokens to agent owner
    const ownerAta = getAssociatedTokenAddressSync(mint, agentOwnerKeypair.publicKey);
    const createAtaTx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        agentOwnerKeypair.publicKey,
        ownerAta,
        agentOwnerKeypair.publicKey,
        mint
      )
    );
    await provider.sendAndConfirm(createAtaTx);
    await mintTo(provider.connection, payer.payer, mint, ownerAta, payer.publicKey, 1_000_000_000);
    await agentOwnerClient.deposit({ mint, amount: new BN(500_000_000) });

    // Spawn an agent
    const spawnResult = await agentOwnerClient.agents.spawnAgent({
      parentKind: 'user',
      parent: (await agentOwnerClient.getUserState(agentOwnerKeypair.publicKey)).owner,
      label: 'x402-agent',
    });
    agent = spawnResult.agent;

    // Fund the agent
    await agentOwnerClient.agents.fundAgent({
      agent,
      mint,
      amount: new BN(100_000_000),
    });

    // Start facilitator server on random port
    facilitatorApp = express();
    facilitatorApp.use(express.json());
    const adapter = new SableAdapter({
      connection: provider.connection,
      expectedReceiver: merchantKeypair.publicKey,
      expectedMint: mint,
    });

    facilitatorApp.post('/verify', async (req: any, res: any) => {
      const header = req.body.header || req.body.xPaymentHeader;
      if (!header) { res.status(400).json({ valid: false, reason: 'Missing header' }); return; }
      try {
        const payload = decodePaymentHeader(header);
        const result = await adapter.verify(payload);
        res.status(result.valid ? 200 : 401).json(result);
      } catch (e: any) {
        res.status(400).json({ valid: false, reason: e.message });
      }
    });

    facilitatorApp.post('/settle', async (req: any, res: any) => {
      const header = req.body.header || req.body.xPaymentHeader;
      if (!header) { res.status(400).json({ settled: false, error: 'Missing header' }); return; }
      try {
        const payload = decodePaymentHeader(header);
        const result = await adapter.settle(payload);
        res.status(result.settled ? 200 : 402).json(result);
      } catch (e: any) {
        res.status(400).json({ settled: false, error: e.message });
      }
    });

    facilitatorApp.get('/health', (_req: any, res: any) => res.json({ status: 'ok' }));

    const facilitatorPort = 9000 + Math.floor(Math.random() * 1000);
    facilitatorUrl = `http://localhost:${facilitatorPort}`;
    await new Promise<void>((resolve: any) => {
      facilitatorServer = facilitatorApp.listen(facilitatorPort, resolve);
    });

    // Start merchant API with x402 middleware using external facilitator
    merchantApp = express();
    merchantApp.use(express.json());
    merchantApp.get(
      '/api/weather',
      sableX402({
        price: '1000000',
        receiver: merchantKeypair.publicKey,
        asset: mint,
        network: 'solana:localnet',
        facilitatorUrl,
        solanaRpcUrl: provider.connection.rpcEndpoint,
      }),
      (req: any, res: any) => {
        res.json({ temp: 22, wind: 12, settled: req.x402Settlement });
      }
    );

    const merchantPort = 8000 + Math.floor(Math.random() * 1000);
    merchantUrl = `http://localhost:${merchantPort}`;
    await new Promise<void>((resolve: any) => {
      merchantServer = merchantApp.listen(merchantPort, resolve);
    });
  });

  after(async () => {
    if (merchantServer) merchantServer.close();
    if (facilitatorServer) facilitatorServer.close();
  });

  it('agent → merchant → 402 → paid → 200', async () => {
    const agentBalanceBefore = await agentOwnerClient.agents.getAgentBalance(agent, mint);
    const merchantBalanceBefore = await merchantClient.getUserBalance(
      (await merchantClient.getUserState(merchantClient.walletPublicKey)).owner,
      mint
    );

    // Step 1: Request without payment → 402
    const first = await fetch(`${merchantUrl}/api/weather`);
    assert.equal(first.status, 402);
    const requirements = await first.json();
    assert.equal(requirements.x402Version, 1);
    assert.isArray(requirements.accepts);

    // Step 2: Build payment payload
    const { header } = await buildPaymentPayload(requirements, agentOwnerClient, agent, 'user');

    // Step 3: Retry with X-PAYMENT → 200
    const second = await fetch(`${merchantUrl}/api/weather`, {
      headers: { 'X-PAYMENT': header },
    });
    assert.equal(second.status, 200);

    const body = await second.json();
    assert.equal(body.temp, 22);
    assert.isDefined(body.settled);
    assert.isTrue(body.settled.settled);

    // Verify balance moved
    const agentBalanceAfter = await agentOwnerClient.agents.getAgentBalance(agent, mint);
    const merchantBalanceAfter = await merchantClient.getUserBalance(
      (await merchantClient.getUserState(merchantClient.walletPublicKey)).owner,
      mint
    );

    assert.equal(
      agentBalanceAfter.amount.toString(),
      agentBalanceBefore.amount.sub(new BN(1000000)).toString()
    );
    assert.equal(
      merchantBalanceAfter.amount.toString(),
      merchantBalanceBefore.amount.add(new BN(1000000)).toString()
    );
  });

  it('replay a used header → rejected', async () => {
    // Get fresh 402
    const req402 = await fetch(`${merchantUrl}/api/weather`);
    assert.equal(req402.status, 402);
    const requirements = await req402.json();

    // Build and submit payment
    const { header } = await buildPaymentPayload(requirements, agentOwnerClient, agent, 'user');
    const paid = await fetch(`${merchantUrl}/api/weather`, {
      headers: { 'X-PAYMENT': header },
    });
    assert.equal(paid.status, 200);

    // Re-submit same header to facilitator /verify → should reject as replay
    const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ header }),
    });
    const verifyBody = await verifyRes.json();
    assert.isFalse(verifyBody.valid);
    assert.include(verifyBody.reason.toLowerCase(), 'replay');
  });
});
