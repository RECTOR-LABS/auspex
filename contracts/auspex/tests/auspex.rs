use auspex::{AuspexContract, AuspexContractClient, Attestation, DataKey, Error};
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Bytes, Env};
use ultrahonk_test_utils::{mutate_byte, Fixture};

fn test_env() -> Env {
    let env = Env::default();
    env.ledger().set_protocol_version(26);
    env.cost_estimate().budget().reset_unlimited();
    env
}

#[test]
fn attest_stores_attestation_for_valid_proof() {
    let env = test_env();
    env.mock_all_auths();
    let f = Fixture::load("solvency");
    let (proof, vk, pi) = f.into_bytes(&env);

    let contract_id = env.register(AuspexContract, (vk.clone(),));
    let client = AuspexContractClient::new(&env, &contract_id);
    let issuer = Address::generate(&env);

    let id0 = client.attest(&issuer, &proof, &pi);
    assert_eq!(id0, 0);
    // Second attestation increments the per-issuer counter.
    let id1 = client.attest(&issuer, &proof, &pi);
    assert_eq!(id1, 1);

    // Read the stored attestation directly from persistent storage and confirm
    // the public-input decode matches the committed solvency policy.
    let stored: Attestation = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::Item(issuer.clone(), 0))
            .unwrap()
    });
    assert_eq!(stored.issuer, issuer);
    assert_eq!(stored.buffer_bps, 10500);
    assert_eq!(stored.max_concentration_bps, 5000);
    assert_eq!(stored.min_liquidity_bps, 3000);
}

#[test]
fn read_methods_return_stored_attestation() {
    let env = test_env();
    env.mock_all_auths();
    let f = Fixture::load("solvency");
    let (proof, vk, pi) = f.into_bytes(&env);

    let contract_id = env.register(AuspexContract, (vk.clone(),));
    let client = AuspexContractClient::new(&env, &contract_id);
    let issuer = Address::generate(&env);

    // Before any attestation: count 0, no latest, no item.
    assert_eq!(client.count(&issuer), 0);
    assert!(client.get_latest(&issuer).is_none());
    assert!(client.get_attestation(&issuer, &0).is_none());

    let id = client.attest(&issuer, &proof, &pi);
    assert_eq!(id, 0);

    let got = client.get_attestation(&issuer, &id).unwrap();
    assert_eq!(got.issuer, issuer);
    assert_eq!(got.buffer_bps, 10500);
    assert_eq!(got.max_concentration_bps, 5000);
    assert_eq!(got.min_liquidity_bps, 3000);

    let latest = client.get_latest(&issuer).unwrap();
    assert_eq!(latest.ledger_seq, got.ledger_seq);
    assert_eq!(latest.commitment, got.commitment);

    assert_eq!(client.count(&issuer), 1);
    // Out-of-range id -> None.
    assert!(client.get_attestation(&issuer, &99).is_none());
}

#[test]
fn attest_rejects_tampered_proof() {
    let env = test_env();
    env.mock_all_auths();
    let f = Fixture::load("solvency");
    let (proof, vk, pi) = f.into_bytes(&env);

    let contract_id = env.register(AuspexContract, (vk.clone(),));
    let bad_proof = Bytes::from_slice(&env, &mutate_byte(&proof.to_alloc_vec(), 100, 0x01));
    let issuer = Address::generate(&env);

    let err = env
        .as_contract(&contract_id, || {
            AuspexContract::attest(env.clone(), issuer.clone(), bad_proof.clone(), pi.clone())
        })
        .expect_err("expected VerificationFailed");
    assert_eq!(err as u32, Error::VerificationFailed as u32);
}

#[test]
fn attest_requires_issuer_auth() {
    let env = test_env();
    // Intentionally NO mock_all_auths(): the issuer has not authorized the call.
    let f = Fixture::load("solvency");
    let (proof, vk, pi) = f.into_bytes(&env);

    let contract_id = env.register(AuspexContract, (vk.clone(),));
    let client = AuspexContractClient::new(&env, &contract_id);
    let issuer = Address::generate(&env);

    // issuer.require_auth() must reject an unauthorized attest.
    let res = client.try_attest(&issuer, &proof, &pi);
    assert!(res.is_err(), "attest must fail without issuer authorization");
}

#[test]
fn attest_rejects_wrong_length_public_inputs() {
    let env = test_env();
    env.mock_all_auths();
    let f = Fixture::load("solvency");
    let (proof, vk, _pi) = f.into_bytes(&env);
    // A 96-byte vector (3 fields) instead of the required 128 (4 fields).
    let short_pi = Bytes::from_slice(&env, &[0u8; 96]);

    let contract_id = env.register(AuspexContract, (vk.clone(),));
    let issuer = Address::generate(&env);

    // 96 != 128 (NUM_PUBLIC_INPUTS * FIELD_BYTES) -> rejected before verify.
    let err = env
        .as_contract(&contract_id, || {
            AuspexContract::attest(env.clone(), issuer.clone(), proof.clone(), short_pi.clone())
        })
        .expect_err("expected InvalidPublicInputs");
    assert_eq!(err as u32, Error::InvalidPublicInputs as u32);
}
