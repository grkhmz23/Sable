import { BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ensureSdk, getPda, PROGRAM_ID } from './setup';

export async function checkConservation(): Promise<void> {
  const sdk = await ensureSdk();
  const connection = sdk.config.connection;

  // Fetch all UserBalance accounts
  const userBalances = await sdk.program.account.userBalance.all();
  const agentBalances = await sdk.program.account.agentBalance.all();
  const taskEscrows = await sdk.program.account.taskEscrow.all();

  let ledgerTotal = new BN(0);

  for (const acc of userBalances) {
    ledgerTotal = ledgerTotal.add(acc.account.amount);
  }

  for (const acc of agentBalances) {
    ledgerTotal = ledgerTotal.add(acc.account.amount);
  }

  for (const acc of taskEscrows) {
    ledgerTotal = ledgerTotal.add(acc.account.amount);
  }

  // Fetch vault ATAs
  const vaultAuthority = getPda().deriveVaultAuthority()[0];
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(vaultAuthority, {
    programId: TOKEN_PROGRAM_ID,
  });

  let vaultTotal = new BN(0);
  for (const ta of tokenAccounts.value) {
    const amount = ta.account.data.parsed.info.tokenAmount.amount;
    vaultTotal = vaultTotal.add(new BN(amount));
  }

  if (!ledgerTotal.eq(vaultTotal)) {
    throw new Error(
      `Conservation check failed: ledger=${ledgerTotal.toString()} vault=${vaultTotal.toString()}`
    );
  }
}
