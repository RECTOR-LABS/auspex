#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env,
    Symbol,
};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, VkLoadError};

/// Auspex attestation contract.
///
/// The verification key (VK) is immutable: set once at deployment via the
/// constructor and never changed. There is no admin key or upgrade path.
#[contract]
pub struct AuspexContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    VkInvalidLength = 1,
    VkInvalidParameters = 2,
    ProofParseError = 3,
    VerificationFailed = 4,
    VkNotSet = 5,
    AlreadyInitialized = 6,
}

#[contracttype]
#[derive(Clone)]
pub struct Attestation {
    pub issuer: Address,
    pub commitment: BytesN<32>,
    pub buffer_bps: u32,
    pub max_concentration_bps: u32,
    pub min_liquidity_bps: u32,
    pub ledger_timestamp: u64,
    pub ledger_seq: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Count(Address),
    Item(Address, u64),
}

#[contractimpl]
impl AuspexContract {
    fn key_vk() -> Symbol {
        symbol_short!("vk")
    }

    pub fn __constructor(env: Env, vk_bytes: Bytes) -> Result<(), Error> {
        if env.storage().instance().has(&Self::key_vk()) {
            return Err(Error::AlreadyInitialized);
        }
        // Validate the VK by parsing it before storing (rejects empty/truncated/invalid at deploy).
        let _ = UltraHonkVerifier::new(&env, &vk_bytes).map_err(|e| match e {
            VkLoadError::WrongLength => Error::VkInvalidLength,
            VkLoadError::InvalidParameters => Error::VkInvalidParameters,
        })?;
        env.storage().instance().set(&Self::key_vk(), &vk_bytes);
        Ok(())
    }

    /// Return the stored verification key bytes for auditability.
    pub fn vk_bytes(env: Env) -> Result<Bytes, Error> {
        env.storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(Error::VkNotSet)
    }
}
