export function resolvePromoPrice(offer) {
  const discounted = Number(offer?.discounted_price);
  if (Number.isFinite(discounted) && discounted > 0) {
    return discounted;
  }

  const fixed = Number(offer?.fixed_price);
  if (Number.isFinite(fixed) && fixed > 0) {
    return fixed;
  }

  return 0;
}
