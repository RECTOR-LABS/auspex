// circuits/solvency/src/main.nr
global N: u32 = 64;   // positions
global K: u32 = 16;   // counterparties

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
    for i in 0..N {
        assert((active[i] as u64) <= 1, "active must be boolean");
        assert((is_liquid[i] as u64) <= 1, "is_liquid must be boolean");
        assert((counterparty_ids[i] as u32) < K, "counterparty id out of range");
    }
    assert((buffer_bps as u64) >= 10000, "buffer must be at least 100 percent");
    assert((max_concentration_bps as u64) <= 10000, "concentration must be at most 100 percent");
    assert((min_liquidity_bps as u64) <= 10000, "liquidity must be at most 100 percent");

    let mut total_assets: u128 = 0;
    let mut liquid_assets: u128 = 0;
    for i in 0..N {
        let amt: u128 = (amounts[i] as u128) * (active[i] as u128);
        total_assets += amt;
        liquid_assets += amt * (is_liquid[i] as u128);
    }

    // The book must have at least one active asset; an all-zero / empty book
    // would otherwise satisfy every ratio vacuously (0 >= 0, 0 <= 0).
    assert(total_assets > 0, "no active assets");

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

    // 3. Liquidity: liquid_assets * 10000 >= total_assets * min_liquidity_bps
    assert(
        liquid_assets * 10000 >= total_assets * (min_liquidity_bps as u128),
        "liquidity: liquid assets below minimum ratio",
    );
}

#[test(should_fail_with = "counterparty id")]
fn test_bad_counterparty_id_fails() {
    let mut amounts: [u64; N] = [0; N];
    amounts[0] = 1000;
    let mut counterparty_ids: [u8; N] = [0; N];
    counterparty_ids[0] = 99; // >= K, out of range
    let mut is_liquid: [u8; N] = [0; N];
    is_liquid[0] = 1;
    let mut active: [u8; N] = [0; N];
    active[0] = 1;
    let liabilities: u64 = 100;
    let salt: Field = 3;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}

#[test(should_fail_with = "liquidity")]
fn test_illiquid_fails() {
    // 1000 total, only 100 liquid -> 10% liquid, policy requires 30%
    let mut amounts: [u64; N] = [0; N];
    amounts[0] = 100;
    amounts[1] = 900;
    let mut counterparty_ids: [u8; N] = [0; N];
    counterparty_ids[1] = 1;
    let mut is_liquid: [u8; N] = [0; N];
    is_liquid[0] = 1;
    let mut active: [u8; N] = [0; N];
    active[0] = 1;
    active[1] = 1;
    let liabilities: u64 = 100;
    let salt: Field = 9;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // min liquidity 30%
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 3000);
}

#[test]
fn test_solvent_passes() {
    let mut amounts: [u64; N] = [0; N];
    amounts[0] = 1000;
    let mut counterparty_ids: [u8; N] = [0; N];
    let mut is_liquid: [u8; N] = [0; N];
    is_liquid[0] = 1;
    let mut active: [u8; N] = [0; N];
    active[0] = 1;
    let liabilities: u64 = 900;
    let salt: Field = 42;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // buffer 105%, concentration 100%, liquidity 100%
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}

#[test(should_fail_with = "insolvent")]
fn test_insolvent_fails() {
    let mut amounts: [u64; N] = [0; N];
    amounts[0] = 1000;
    let mut counterparty_ids: [u8; N] = [0; N];
    let mut is_liquid: [u8; N] = [0; N];
    is_liquid[0] = 1;
    let mut active: [u8; N] = [0; N];
    active[0] = 1;
    let liabilities: u64 = 1000; // assets 1000 < 1000 * 1.05
    let salt: Field = 42;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}

#[test(should_fail_with = "concentration")]
fn test_over_concentrated_fails() {
    // 800 with counterparty 1, 200 with counterparty 2 -> 80% in one cp
    let mut amounts: [u64; N] = [0; N];
    amounts[0] = 800;
    amounts[1] = 200;
    let mut counterparty_ids: [u8; N] = [0; N];
    counterparty_ids[0] = 1;
    counterparty_ids[1] = 2;
    let mut is_liquid: [u8; N] = [0; N];
    is_liquid[0] = 1;
    is_liquid[1] = 1;
    let mut active: [u8; N] = [0; N];
    active[0] = 1;
    active[1] = 1;
    let liabilities: u64 = 100;
    let salt: Field = 7;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // max concentration 20%
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 2000, 10000);
}

#[test(should_fail_with = "no active assets")]
fn test_empty_book_fails() {
    // No active positions -> total_assets == 0 -> cannot attest solvency.
    let amounts: [u64; N] = [0; N];
    let counterparty_ids: [u8; N] = [0; N];
    let is_liquid: [u8; N] = [0; N];
    let active: [u8; N] = [0; N];
    let liabilities: u64 = 0;
    let salt: Field = 5;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}

#[test(should_fail_with = "active must be boolean")]
fn test_non_boolean_active_fails() {
    let mut amounts: [u64; N] = [0; N];
    amounts[0] = 1000;
    let counterparty_ids: [u8; N] = [0; N];
    let mut is_liquid: [u8; N] = [0; N];
    is_liquid[0] = 1;
    let mut active: [u8; N] = [0; N];
    active[0] = 2; // not boolean -> must be rejected
    let liabilities: u64 = 100;
    let salt: Field = 6;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}

#[test(should_fail_with = "buffer must be at least")]
fn test_buffer_below_one_hundred_percent_fails() {
    let mut amounts: [u64; N] = [0; N];
    amounts[0] = 1000;
    let counterparty_ids: [u8; N] = [0; N];
    let mut is_liquid: [u8; N] = [0; N];
    is_liquid[0] = 1;
    let mut active: [u8; N] = [0; N];
    active[0] = 1;
    let liabilities: u64 = 100;
    let salt: Field = 8;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // buffer 99.99% (< 10000) must be rejected
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 9999, 10000, 10000);
}
