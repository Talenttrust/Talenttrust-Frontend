import { isValidStellarAddress, normalizeStellarAddress } from './stellarAddress';

export function truncateAddress(value: string, prefixLength = 6, suffixLength = 4): string {
  if (!value) {
    return '';
  }

  const normalizedValue = normalizeStellarAddress(value);
  const displayValue = isValidStellarAddress(normalizedValue) ? normalizedValue : value;

  if (displayValue.length <= prefixLength + suffixLength + 3) {
    return displayValue;
  }

  return `${displayValue.slice(0, prefixLength)}...${displayValue.slice(-suffixLength)}`;
}
