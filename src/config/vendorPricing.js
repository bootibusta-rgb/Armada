/**
 * Vendor premium subscription pricing (JMD)
 * 1 week = J$1,000 base. Longer plans get better per-week value.
 */
export const VENDOR_PLANS = [
  { id: '1week', label: '1 Week', duration: 7, price: 1000, perWeek: 1000, popular: false },
  { id: '2weeks', label: '2 Weeks', duration: 14, price: 1800, perWeek: 900, popular: true },
  { id: '1month', label: '1 Month', duration: 30, price: 3500, perWeek: 875 },
  { id: '3months', label: '3 Months', duration: 90, price: 9000, perWeek: 700 },
  { id: '1year', label: '1 Year', duration: 365, price: 30000, perWeek: 577 },
];
