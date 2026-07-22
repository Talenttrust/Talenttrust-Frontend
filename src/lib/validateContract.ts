import { ValidationError } from './validateLogin';
import { isValidStellarAddress } from './stellarAddress';

/**
 * The raw string values captured from the Create Contract form fields.
 * All values are strings because HTML inputs always yield strings.
 */
export interface ContractFormValues {
  /** The display name for the contract. */
  contractName: string;
  /** The freelancer's Stellar public key (G... address). */
  freelancerAddress: string;
  /**
   * The total escrow value as a string from the number input.
   * Parsed to a float during validation; kept as a string here to
   * mirror the raw DOM value without pre-transforming it.
   */
  totalValue: string;
  /** The ISO 4217 currency code or blockchain token symbol (e.g. "USD", "XLM"). */
  currency: string;
}

/**
 * Validates the Create Contract form fields.
 *
 * Rules:
 * - `contractName`: required (non-empty after trim).
 * - `freelancerAddress`: required and must pass `isValidStellarAddress` —
 *   i.e. exactly 56 characters, starts with "G", base32 alphabet only.
 * - `totalValue`: required and must parse as a finite number greater than zero.
 * - `currency`: required (non-empty after trim).
 *
 * The function is intentionally pure and side-effect-free so it can be
 * called from both the form component and unit tests without any React context.
 *
 * Time complexity:  O(1) — the field count is fixed at 4; `isValidStellarAddress`
 *                   runs a single regex test on a max-56-char string.
 * Space complexity: O(1) — the returned errors array is bounded by the fixed
 *                   number of fields.
 *
 * @param values - The raw string values from the form inputs.
 * @returns An array of `ValidationError` objects. An empty array means the
 *          form is valid and can be submitted.
 */
export function validateContract(values: ContractFormValues): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!values.contractName.trim()) {
    errors.push({ fieldId: 'contractName', message: 'Contract name is required' });
  }

  if (!values.freelancerAddress.trim()) {
    errors.push({ fieldId: 'freelancerAddress', message: 'Freelancer address is required' });
  } else if (!isValidStellarAddress(values.freelancerAddress)) {
    errors.push({
      fieldId: 'freelancerAddress',
      message: 'Freelancer address must be a valid Stellar G... address',
    });
  }

  const parsed = parseFloat(values.totalValue);
  if (!values.totalValue.trim() || isNaN(parsed) || !isFinite(parsed) || parsed <= 0) {
    errors.push({ fieldId: 'totalValue', message: 'Total value must be a positive number' });
  }

  if (!values.currency.trim()) {
    errors.push({ fieldId: 'currency', message: 'Currency is required' });
  }

  return errors;
}
