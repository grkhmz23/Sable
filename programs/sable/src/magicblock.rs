//! MagicBlock Ephemeral Rollup Integration
//!
//! NOTE: This module provides constants for MagicBlock ER integration.
//! Actual CPI calls to MagicBlock will be wired in Prompt 2 via
//! ephemeral-rollups-sdk.

use anchor_lang::prelude::*;

/// MagicBlock delegation program ID (mainnet)
pub const MAGICBLOCK_DELEGATION_PROGRAM_ID: Pubkey =
    pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

/// MagicBlock magic program ID
pub const MAGICBLOCK_MAGIC_PROGRAM_ID: Pubkey =
    pubkey!("Magic11111111111111111111111111111111111111");
