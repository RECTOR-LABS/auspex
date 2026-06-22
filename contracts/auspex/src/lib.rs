#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env,
    Symbol,
};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, VkLoadError, PROOF_BYTES};

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

    /// Verify a solvency proof and record the resulting attestation.
    ///
    /// The caller (`issuer`) must authorise this call. A valid UltraHonk proof
    /// and the 128-byte public-input vector (4 × 32-byte BIG-ENDIAN field
    /// elements) are required. On success the attestation is stored under
    /// `DataKey::Item(issuer, id)`, the per-issuer counter is bumped, an
    /// `attested` event is emitted, and the new attestation id is returned.
    pub fn attest(
        env: Env,
        issuer: Address,
        proof: Bytes,
        public_inputs: Bytes,
    ) -> Result<u64, Error> {
        issuer.require_auth();

        if proof.len() as usize != PROOF_BYTES {
            return Err(Error::ProofParseError);
        }
        // Exactly 4 public inputs (32 bytes each), big-endian.
        if public_inputs.len() != 128 {
            return Err(Error::ProofParseError);
        }

        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(Error::VkNotSet)?;
        let verifier = UltraHonkVerifier::new(&env, &vk_bytes).map_err(|e| match e {
            VkLoadError::WrongLength => Error::VkInvalidLength,
            VkLoadError::InvalidParameters => Error::VkInvalidParameters,
        })?;
        verifier
            .verify(&env, &proof, &public_inputs)
            .map_err(|_| Error::VerificationFailed)?;

        // Decode the public inputs (layout: [commitment, buffer_bps, max_concentration_bps,
        // min_liquidity_bps], each a 32-byte BIG-ENDIAN field element, u32 right-aligned).
        let commitment = commitment_from(&env, &public_inputs);
        let buffer_bps = field_tail_u32(&public_inputs, 1);
        let max_concentration_bps = field_tail_u32(&public_inputs, 2);
        let min_liquidity_bps = field_tail_u32(&public_inputs, 3);

        let id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::Count(issuer.clone()))
            .unwrap_or(0u64);
        let attestation = Attestation {
            issuer: issuer.clone(),
            commitment,
            buffer_bps,
            max_concentration_bps,
            min_liquidity_bps,
            ledger_timestamp: env.ledger().timestamp(),
            ledger_seq: env.ledger().sequence(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Item(issuer.clone(), id), &attestation);
        env.storage()
            .persistent()
            .set(&DataKey::Count(issuer.clone()), &(id + 1));
        env.events()
            .publish((symbol_short!("attested"), issuer), id);
        Ok(id)
    }
}

// =============================================================================
// Public-input decode helpers
// =============================================================================

/// Extract the commitment: first 32 bytes of `pi` as a `BytesN<32>`.
fn commitment_from(env: &Env, pi: &Bytes) -> BytesN<32> {
    let mut buf = [0u8; 32];
    pi.slice(0..32).copy_into_slice(&mut buf);
    BytesN::from_array(env, &buf)
}

/// Extract the u32 encoded in the **last 4 bytes** of the `index`-th 32-byte
/// field element (big-endian, right-aligned zero-padded).
///
/// Field layout: `pi[index*32 .. (index+1)*32]`, u32 at `[..28..32]`.
fn field_tail_u32(pi: &Bytes, index: u32) -> u32 {
    let end = (index + 1) * 32;
    let mut buf = [0u8; 4];
    pi.slice((end - 4)..end).copy_into_slice(&mut buf);
    u32::from_be_bytes(buf)
}
