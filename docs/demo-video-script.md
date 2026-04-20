# Sable Demo Video Script

**Target length:** 3–4 minutes  
**Format:** Screen recording with voiceover  
**Resolution:** 1920×1080, 30fps

---

## Scene 1: Opening (0:00–0:20)

**Visual:** Black screen. Sable logo fades in. Text: "Private Programmable Money for AI Agents."

**Voiceover:**
> "Sable is private programmable money for AI agents on Solana. Built on MagicBlock's Ephemeral Rollups, it lets autonomous agents hold balances, bid on tasks, and pay for API calls — without exposing amounts on-chain."

**Transition:** Cut to app at `localhost:3000`, wallet already connected.

---

## Scene 2: Treasury Console — Fund & Delegate (0:20–0:55)

**Visual:** `/` — TreasuryView. Shows "$0.00" balance. User clicks "Fund with USDC."

**Voiceover:**
> "Every user starts with a treasury. I can fund it with USDC through MagicBlock's Private Payments API, which handles KYC and AML off-chain."

**Action:**
1. Click "Fund with USDC"
2. Enter amount: 100
3. Click "Confirm"
4. Wait for transaction confirmation (Devnet, ~5s)
5. Balance updates to "$100.00"

**Voiceover:**
> "Once funded, I can delegate my balances to MagicBlock's Ephemeral Rollup for fast, cheap internal transfers."

**Action:**
6. Click "Delegate to ER"
7. Confirm transaction
8. Status changes to "Delegated ✓"

**Transition:** Fade to `/agents`

---

## Scene 3: Agent Dashboard — Spawn & Fund (0:55–1:40)

**Visual:** `/agents` — AgentsView. Empty tree. User clicks "Spawn Agent."

**Voiceover:**
> "Agents are hierarchical. I can spawn child agents with their own keypairs and programmable spend policies."

**Action:**
1. Click "Spawn Agent"
2. Name: "Image-Gen-1"
3. Per-tx limit: 10
4. Daily limit: 50
5. Allowed mints: USDC only
6. Click "Generate Keypair" → keypair downloads as JSON
7. Click "Confirm Spawn"
8. Transaction confirms, agent appears in tree

**Voiceover:**
> "The agent gets its own keypair — which I download immediately. I can fund it from my treasury and set granular policy: per-transaction caps, daily limits, allowed mints, even expiry."

**Action:**
9. Select "Image-Gen-1" in tree
10. Click "Fund Agent"
11. Amount: 25
12. Confirm
13. Agent balance updates to "$25.00"

**Transition:** Fade to `/tasks`

---

## Scene 4: Auction Marketplace — Create & Bid (1:40–2:30)

**Visual:** `/tasks` — TasksView. Empty list. User clicks "Create Task."

**Voiceover:**
> "Agents can bid on tasks in a sealed-bid auction. The bid amount stays hidden until the reveal phase."

**Action:**
1. Click "Create Task"
2. Title: "Generate 10 product images"
3. Budget: 30
4. Commit deadline: 2 minutes from now
5. Reveal deadline: 4 minutes from now
6. Confirm
7. Task appears in "Open Tasks"

**Voiceover:**
> "I posted a task with a 30-dollar budget. Now an agent commits a bid without revealing the amount."

**Action:**
8. Switch to second browser / second wallet (agent wallet)
9. Click "Commit Bid"
10. Amount: 15
11. Deposit: 5
12. Click "Generate Nonce" → nonce downloads as JSON
13. Confirm
14. Bid committed, hash shown on screen

**Voiceover:**
> "The agent downloads a secret nonce — without it, the bid can never be revealed. The on-chain record only shows a hash. The actual amount is completely private."

**Transition:** Wait 2 minutes (cut forward), then show reveal

**Action:**
15. After commit deadline passes, click "Reveal Bid"
16. Drag nonce JSON file into drop zone
17. Confirm
18. Bid reveals as $15.00

**Voiceover:**
> "When the reveal phase opens, the agent submits the nonce. The chain verifies the hash match and records the amount."

**Transition:** Wait 2 more minutes (cut forward), then show settle

**Action:**
19. After reveal deadline, click "Settle"
20. Winner announced: "Image-Gen-1 wins at $15.00"
21. Escrow transfers shown

**Voiceover:**
> "After the reveal deadline, anyone can settle. The lowest revealed bid wins. The poster gets their change back, and the winner receives the task budget."

**Transition:** Fade to `/x402`

---

## Scene 5: x402 Demo — Pay Per Request (2:30–3:15)

**Visual:** `/x402` — X402DemoView. Left pane empty, right pane empty log.

**Voiceover:**
> "Finally, agents can pay for API calls in real time using the x402 protocol. It's like HTTP 402 Payment Required, but settled on-chain in under a second."

**Action:**
1. Select agent "Image-Gen-1" from dropdown
2. City: "Tokyo"
3. Click "Get Weather"

**Visual:** Log panel shows:
```
[10:42:01] GET /api/demo/weather?city=Tokyo
[10:42:01] ← 402 Payment Required (price: 0.01 USDC)
[10:42:01] Building agent_transfer tx...
[10:42:02] Signed by agent Image-Gen-1
[10:42:02] → X-PAYMENT header attached
[10:42:02] ← 200 OK
[10:42:02] { city: "Tokyo", temp: 18, condition: "Cloudy" }
```

**Voiceover:**
> "The first request gets a 402. The agent's x402 client automatically builds a signed transfer, retries with the payment header, and receives the response. The merchant's facilitator verifies and settles on-chain."

**Action:**
4. Click "Run 100 calls"
5. Progress bar fills
6. Log shows throughput stats: "100 calls in 4.2s, avg 42ms"

**Voiceover:**
> "Because settlement runs through MagicBlock's Ephemeral Rollup, we can do a hundred pay-per-request calls in just over four seconds."

**Transition:** Fade to closing slide

---

## Scene 6: Closing (3:15–3:45)

**Visual:** Closing slide with:
- Sable logo
- "Built on MagicBlock"
- Links: GitHub, Devnet explorer, Live app
- "Private Programmable Money for AI Agents"

**Voiceover:**
> "Sable: private programmable money for AI agents. Hierarchical treasuries, sealed-bid auctions, and x402 pay-per-request — all running on MagicBlock's Ephemeral Rollups. Try it live, read the docs, or check out the code."

**End.**

---

## Recording Notes

- Use Devnet for all transactions (faster than mainnet, realistic enough)
- Speed up wait times with video editing (jump cuts between phases)
- Keep mouse cursor visible for clarity
- Use a clean browser profile (no bookmarks bar, minimal extensions)
- Record at 1920×1080, export at 1080p 30fps
- Background music: optional, low volume instrumental

## Required Setup Before Recording

1. Devnet wallet with airdropped SOL
2. Funded treasury (via mock payments or devnet USDC faucet)
3. At least one spawned agent with balance
4. Pre-created task if you want to skip the wait times
5. Mock services running (or use live endpoints if Prompt 24 complete)
