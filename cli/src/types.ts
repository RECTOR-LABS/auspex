export interface Position {
  amount: number;
  counterpartyId: number;
  isLiquid: boolean;
}

export interface Book {
  positions: Position[];
  liabilities: number;
}

export interface Policy {
  bufferBps: number;
  maxConcentrationBps: number;
  minLiquidityBps: number;
}

/** Circuit globals: N positions, K counterparties. */
export const N = 64;
export const K = 16;
