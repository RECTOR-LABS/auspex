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

    // Read the stored attestation directly (read methods land in Task 2.3) and
    // confirm the public-input decode matches the committed solvency policy.
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
