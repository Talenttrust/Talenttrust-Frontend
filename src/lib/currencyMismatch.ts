export function normalizeCurrencyCode(currency: string): string {
  return currency.trim().toUpperCase();
}

export type CurrencyMilestone = {
  id: string;
  currency: string;
};

export function findCurrencyMismatches(
  contractCurrency: string,
  milestones: CurrencyMilestone[],
): string[] {
  const normalizedContractCurrency = normalizeCurrencyCode(contractCurrency);

  if (!normalizedContractCurrency) {
    return [];
  }

  return milestones
    .filter(
      (milestone) =>
        normalizeCurrencyCode(milestone.currency) !== normalizedContractCurrency,
    )
    .map((milestone) => milestone.id);
}
