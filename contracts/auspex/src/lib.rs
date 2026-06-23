#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env,
    Symbol,
};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, VkLoadError, PROOF_BYTES};

/// Public-input layout: `NUM_PUBLIC_INPUTS` 32-byte BIG-ENDIAN field elements,
/// in order [commitment, buffer_bps, max_concentration_bps, min_liquidity_bps].
/// The commitment uses all `FIELD_BYTES`; each policy value is a `u32` in the
/// low 4 bytes (the circuit types them `u32`, so the high bytes are zero).
const FIELD_BYTES: usize = 32;
const NUM_PUBLIC_INPUTS: usize = 4;
const PUBLIC_INPUTS_BYTES: usize = NUM_PUBLIC_INPUTS * FIELD_BYTES;
const PI_COMMITMENT: usize = 0;
const PI_BUFFER_BPS: usize = 1;
const PI_MAX_CONCENTRATION_BPS: usize = 2;
const PI_MIN_LIQUIDITY_BPS: usize = 3;

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
    /// Public-input vector was the wrong length, or a policy field carried
    /// out-of-range (non-`u32`) high bytes.
    InvalidPublicInputs = 7,
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
        UltraHonkVerifier::new(&env, &vk_bytes).map_err(map_vk_err)?;
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
        // Exactly NUM_PUBLIC_INPUTS field elements (FIELD_BYTES each), big-endian.
        if public_inputs.len() as usize != PUBLIC_INPUTS_BYTES {
            return Err(Error::InvalidPublicInputs);
        }

        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(Error::VkNotSet)?;
        let verifier = UltraHonkVerifier::new(&env, &vk_bytes).map_err(map_vk_err)?;
        verifier
            .verify(&env, &proof, &public_inputs)
            .map_err(|_| Error::VerificationFailed)?;

        // Decode the verified public inputs into the commitment + policy values.
        let (commitment, buffer_bps, max_concentration_bps, min_liquidity_bps) =
            decode_public_inputs(&env, &public_inputs)?;

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

    /// The attestation at `id` for `issuer`, or None if absent.
    pub fn get_attestation(env: Env, issuer: Address, id: u64) -> Option<Attestation> {
        env.storage().persistent().get(&DataKey::Item(issuer, id))
    }

    /// Number of attestations recorded for `issuer` (0 if none).
    pub fn count(env: Env, issuer: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::Count(issuer))
            .unwrap_or(0u64)
    }

    /// The most recent attestation for `issuer`, or None if there are none.
    pub fn get_latest(env: Env, issuer: Address) -> Option<Attestation> {
        let n = Self::count(env.clone(), issuer.clone());
        if n == 0 {
            None
        } else {
            Self::get_attestation(env, issuer, n - 1)
        }
    }
}

// =============================================================================
// Public-input decode helpers
// =============================================================================

/// Map a verification-key load error to this contract's error type.
fn map_vk_err(e: VkLoadError) -> Error {
    match e {
        VkLoadError::WrongLength => Error::VkInvalidLength,
        VkLoadError::InvalidParameters => Error::VkInvalidParameters,
    }
}

/// Decode the verified, `PUBLIC_INPUTS_BYTES`-long public-input vector into the
/// commitment and the three `u32` policy values.
///
/// The vector is copied once into a fixed stack buffer, then read field by
/// field. The commitment uses all `FIELD_BYTES` of field 0; each policy value
/// is a `u32` in the low 4 bytes of its field. The circuit types the policy
/// inputs as `u32`, so the upper `FIELD_BYTES - 4` bytes of a correctly
/// verified proof are always zero; `policy_u32` enforces that invariant rather
/// than silently truncating, returning `InvalidPublicInputs` if it is ever
/// violated (defense-in-depth — unreachable while the verifier is sound).
fn decode_public_inputs(env: &Env, pi: &Bytes) -> Result<(BytesN<32>, u32, u32, u32), Error> {
    let mut buf = [0u8; PUBLIC_INPUTS_BYTES];
    pi.copy_into_slice(&mut buf);

    let start = PI_COMMITMENT * FIELD_BYTES;
    let mut commitment = [0u8; FIELD_BYTES];
    commitment.copy_from_slice(&buf[start..start + FIELD_BYTES]);

    Ok((
        BytesN::from_array(env, &commitment),
        policy_u32(&buf, PI_BUFFER_BPS)?,
        policy_u32(&buf, PI_MAX_CONCENTRATION_BPS)?,
        policy_u32(&buf, PI_MIN_LIQUIDITY_BPS)?,
    ))
}

/// Read the `u32` policy value held in the low 4 bytes of field `index`,
/// asserting the upper `FIELD_BYTES - 4` bytes are zero.
fn policy_u32(buf: &[u8; PUBLIC_INPUTS_BYTES], index: usize) -> Result<u32, Error> {
    let start = index * FIELD_BYTES;
    let tail = start + FIELD_BYTES - 4;
    for &b in &buf[start..tail] {
        if b != 0 {
            return Err(Error::InvalidPublicInputs);
        }
    }
    let mut be = [0u8; 4];
    be.copy_from_slice(&buf[tail..tail + 4]);
    Ok(u32::from_be_bytes(be))
}
