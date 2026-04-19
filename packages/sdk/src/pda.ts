import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Seeds
const CONFIG_SEED = Buffer.from('config');
const USER_STATE_SEED = Buffer.from('user_state');
const AGENT_STATE_SEED = Buffer.from('agent_state');
const USER_BALANCE_SEED = Buffer.from('user_balance');
const VAULT_AUTHORITY_SEED = Buffer.from('vault_authority');

export class PdaHelper {
  constructor(private programId: PublicKey) {}

  /**
   * Derive Config PDA
   */
  deriveConfig(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      this.programId
    );
  }

  /**
   * Derive Vault Authority PDA
   */
  deriveVaultAuthority(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [VAULT_AUTHORITY_SEED],
      this.programId
    );
  }

  /**
   * Derive UserState PDA for a given owner
   */
  deriveUserState(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [USER_STATE_SEED, owner.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive AgentState PDA for a given parent and nonce
   */
  deriveAgentState(parent: PublicKey, nonce: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        AGENT_STATE_SEED,
        parent.toBuffer(),
        Buffer.from(new Uint32Array([nonce]).buffer),
      ],
      this.programId
    );
  }

  /**
   * Derive UserBalance PDA for a given owner and mint
   */
  deriveUserBalance(owner: PublicKey, mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        USER_BALANCE_SEED,
        owner.toBuffer(),
        mint.toBuffer(),
      ],
      this.programId
    );
  }

  /**
   * Derive Vault ATA for a given mint
   */
  deriveVaultAta(mint: PublicKey, vaultAuthority: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        vaultAuthority.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];
  }

  /**
   * Derive User ATA for a given owner and mint
   */
  deriveUserAta(owner: PublicKey, mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        owner.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];
  }

  /**
   * Get all PDAs for a user and mint in one call
   */
  getAllPdas(owner: PublicKey, mint: PublicKey) {
    const [userState, userStateBump] = this.deriveUserState(owner);
    const [userBalance, userBalanceBump] = this.deriveUserBalance(owner, mint);
    const [vaultAuthority, vaultAuthorityBump] = this.deriveVaultAuthority();
    const vaultAta = this.deriveVaultAta(mint, vaultAuthority);

    return {
      userState,
      userStateBump,
      userBalance,
      userBalanceBump,
      vaultAuthority,
      vaultAuthorityBump,
      vaultAta,
      userAta: this.deriveUserAta(owner, mint),
    };
  }
}
