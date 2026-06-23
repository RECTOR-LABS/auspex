// commitment helper circuit
// Computes the Pedersen commitment over the solvency witness and prints it.
// Used by the CLI to derive the commitment before writing solvency/Prover.toml.

global N: u32 = 64;

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
) {
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    println(c);
}

#[test]
fn test_known_vector() {
    let mut amounts: [u64; N] = [0; N];
    amounts[0] = 500000;
    amounts[1] = 300000;
    amounts[2] = 200000;

    let mut counterparty_ids: [u8; N] = [0; N];
    counterparty_ids[0] = 0;
    counterparty_ids[1] = 1;
    counterparty_ids[2] = 2;

    let mut is_liquid: [u8; N] = [0; N];
    is_liquid[0] = 1;
    is_liquid[1] = 1;
    is_liquid[2] = 0;

    let mut active: [u8; N] = [0; N];
    active[0] = 1;
    active[1] = 1;
    active[2] = 1;

    let liabilities: u64 = 800000;
    let salt: Field = 42;

    let result = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    assert(result == 0x2612e77e9d1d611842c9e711aee99c7afb216704bf4bbd9fc4f8b0c8aa5af8bd);
}
