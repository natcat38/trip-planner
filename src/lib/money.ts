export function minorUnitExponent(currency: string): number {
  // maximumFractionDigits is always resolved for style: 'currency'; TS types it as optional
  // because the field is shared with the (sometimes-unset) decimal-style case.
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits!;
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** minorUnitExponent(currency));
}

export function formatMoney(minorAmount: number, currency: string): string {
  const amount = minorAmount / 10 ** minorUnitExponent(currency);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amount,
  );
}
