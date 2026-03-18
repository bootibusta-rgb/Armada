const PROMOS = {
  KFC20: { discount: 20, minFare: 500 },
  ARMADA10: { discount: 10, minFare: 300 },
  FIRST50: { discount: 50, minFare: 500, oneTime: true },
};

export function validatePromo(code, fare, userId) {
  const c = (code || '').trim().toUpperCase();
  const promo = PROMOS[c];
  if (!promo) return { valid: false, error: 'Invalid code' };
  if (fare < promo.minFare) return { valid: false, error: `Min fare J$${promo.minFare}` };
  return { valid: true, discount: promo.discount, code: c };
}

export function getPromoDiscount(code, fare) {
  const r = validatePromo(code, fare);
  return r.valid ? r.discount : 0;
}
