// circuits/solvency/src/main.nr
global N: u32 = 8;   // positions (raise to 64 after the circuit is green)
global K: u32 = 4;   // counterparties (raise to 16 after green)

fn compute_commitment(
    amounts: [u64; N],
    counterparty_ids: [u8; N],
    is_liquid: [u8; N],
    active: [u8; N],
    liabilities: u64,
    salt: Field,
) -> Field {
    let mut preimage: [Field; 4 * N + 2] = [0; 4 * N + 2];
    for i in 0..N {
        preimage[i] = amounts[i] as Field;
        preimage[N + i] = counterparty_ids[i] as Field;
        preimage[2 * N + i] = is_liquid[i] as Field;
        preimage[3 * N + i] = active[i] as Field;
    }
    preimage[4 * N] = liabilities as Field;
    preimage[4 * N + 1] = salt;
    std::hash::pedersen_hash(preimage)
}

fn main(
    amounts: [u64; N],
    counterparty_ids: [u8; N],
    is_liquid: [u8; N],
    active: [u8; N],
    liabilities: u64,
    salt: Field,
    commitment: pub Field,
    buffer_bps: pub u32,
    max_concentration_bps: pub u32,
    min_liquidity_bps: pub u32,
) {
    let mut total_assets: u128 = 0;
    let mut liquid_assets: u128 = 0;
    for i in 0..N {
        let amt: u128 = (amounts[i] as u128) * (active[i] as u128);
        total_assets += amt;
        liquid_assets += amt * (is_liquid[i] as u128);
    }

    // 1. Solvency: total_assets * 10000 >= liabilities * buffer_bps
    assert(
        total_assets * 10000 >= (liabilities as u128) * (buffer_bps as u128),
        "insolvent: assets below liabilities times buffer",
    );

    let computed = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    assert(computed == commitment, "commitment mismatch");

    // 2. Concentration: for each counterparty, cp_sum * 10000 <= total_assets * max_concentration_bps
    for j in 0..K {
        let mut cp_sum: u128 = 0;
        for i in 0..N {
            let is_match: u128 = if (counterparty_ids[i] as u32) == j { 1 } else { 0 };
            cp_sum += (amounts[i] as u128) * (active[i] as u128) * is_match;
        }
        assert(
            cp_sum * 10000 <= total_assets * (max_concentration_bps as u128),
            "concentration: counterparty exposure exceeds limit",
        );
    }

    let _ = min_liquidity_bps; // replaced in Task 1.4
}

#[test]
fn test_solvent_passes() {
    let amounts: [u64; N] = [1000, 0, 0, 0, 0, 0, 0, 0];
    let counterparty_ids: [u8; N] = [0, 0, 0, 0, 0, 0, 0, 0];
    let is_liquid: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let active: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let liabilities: u64 = 900;
    let salt: Field = 42;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // buffer 105%, concentration 100%, liquidity 100%
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}

#[test(should_fail_with = "insolvent")]
fn test_insolvent_fails() {
    let amounts: [u64; N] = [1000, 0, 0, 0, 0, 0, 0, 0];
    let counterparty_ids: [u8; N] = [0, 0, 0, 0, 0, 0, 0, 0];
    let is_liquid: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let active: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let liabilities: u64 = 1000; // assets 1000 < 1000 * 1.05
    let salt: Field = 42;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}

#[test(should_fail_with = "concentration")]
fn test_over_concentrated_fails() {
    // 800 with counterparty 1, 200 with counterparty 2 -> 80% in one cp
    let amounts: [u64; N] = [800, 200, 0, 0, 0, 0, 0, 0];
    let counterparty_ids: [u8; N] = [1, 2, 0, 0, 0, 0, 0, 0];
    let is_liquid: [u8; N] = [1, 1, 0, 0, 0, 0, 0, 0];
    let active: [u8; N] = [1, 1, 0, 0, 0, 0, 0, 0];
    let liabilities: u64 = 100;
    let salt: Field = 7;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // max concentration 20%
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 2000, 10000);
}
