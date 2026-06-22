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
    // constraints added in Tasks 1.2-1.5
    let _ = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
}
