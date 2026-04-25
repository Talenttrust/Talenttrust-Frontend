export function truncateAddress(value: string, prefixLength = 6, suffixLength = 4): string {
  if (!value) {
    return '';
  }
  if (value.length <= prefixLength + suffixLength + 3) {
    return value;
  }
  return `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`;
}
