/** New rider profile bonus: 100 Armada coins = J$100 ride credit when redeemed in the standard bundle. */
export const RIDER_WELCOME_COINS = 100;

/** Fallback when balance is not loaded yet (matches welcome amount for new accounts). */
export const DEFAULT_RIDER_COINS_FALLBACK = RIDER_WELCOME_COINS;

/** Max 100-coin redemptions per calendar month (balance can exceed; cap is on uses). */
export const MAX_COIN_REDEMPTIONS_PER_MONTH = 3;
