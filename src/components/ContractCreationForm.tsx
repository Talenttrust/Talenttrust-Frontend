'use client';

import React, { useState, useCallback, useEffect, FormEvent, useRef } from 'react';
import { FormField } from './FormField';
import { ErrorSummary } from './ErrorSummary';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';
import { isValidStellarAddress } from '@/lib/stellarAddress';
import { sanitizeUserText } from '@/lib/sanitizeUserText';
import {
  MAX_CONTRACT_NAME_LENGTH,
  MAX_PARTY_LABEL_LENGTH,
  clearContractDraft,
  loadContractDraft,
  saveContractDraft,
} from '@/lib/contractDraft';
import {
  combineValidators,
  validateRequired,
  validateMaxLength,
  validatePositiveNumber,
  validateStellarAddress,
} from '@/lib/fieldValidators';
import type { Contract } from '@/types/domain';

// Field limits live with the draft envelope that has to re-validate them on
// restore, and are re-exported here so existing importers keep working.
export { MAX_CONTRACT_NAME_LENGTH, MAX_PARTY_LABEL_LENGTH };

export interface ContractFormData {
  contractName: string;
  parties: Array<{ label: string; address: string }>;
  totalValue: string;
  currency: string;
}

interface ContractCreationFormProps {
  onSubmit: (contract: Contract) => void;
  onCancel: () => void;
  /**
   * The wallet address the draft belongs to.
   *
   * Drafts are only persisted when this is a non-empty string. An anonymous
   * session has no identity to own a draft, and storing one anyway is how a
   * half-typed contract ends up in front of a different wallet after a
   * reconnect — the exact hazard this feature exists to close.
   */
  identity?: string | null;
}

/** The pristine form: two empty party rows, USD, nothing typed. */
const emptyParties = (): Array<{ label: string; address: string }> => [
  { label: '', address: '' },
  { label: '', address: '' },
];

/**
 * Accessible contract creation form that collects contract details
 * and validates Stellar addresses before submission.
 *
 * Validation rules:
 * - Contract name is required
 * - At least two parties are required
 * - Each party must have both a label and a valid Stellar address
 * - Total value must be a positive number
 * - Currency is required
 *
 * Errors are surfaced via ErrorSummary for screen reader accessibility.
 */
export const ContractCreationForm: React.FC<ContractCreationFormProps> = ({
  onSubmit,
  onCancel,
  identity = null,
}) => {
  // Only a real address can own a draft; `undefined` and '' are both anonymous.
  const draftOwner = typeof identity === 'string' && identity.trim() !== '' ? identity : null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useDialogFocusTrap({
    isOpen: true,
    dialogRef,
    initialFocusRef: firstFieldRef,
    onEscape: onCancel,
    restoreFocus: true,
  });

  const [contractName, setContractName] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [parties, setParties] = useState<Array<{ label: string; address: string }>>(emptyParties);
  const [errors, setErrors] = useState<Array<{ fieldId: string; message: string }>>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  /** Set once a draft has been restored, so the form can say so and offer a way out. */
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  /** A non-blocking message about the draft itself (restored, dropped, unsaved). */
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  /**
   * The identity whose restore has completed.
   *
   * Saving is gated on this so a wallet switch cannot write the previous
   * identity's field values into the new identity's envelope during the same
   * render the switch arrives on.
   */
  const [restoredFor, setRestoredFor] = useState<string | null>(null);

  // Inline validators for real-time validation
  const validateContractNameField = combineValidators([
    validateRequired('Contract name'),
    validateMaxLength('Contract name', MAX_CONTRACT_NAME_LENGTH),
  ]);

  const validateTotalValueField = combineValidators([
    validateRequired('Total value'),
    validatePositiveNumber('Total value'),
  ]);

  const validateCurrencyField = combineValidators([
    validateRequired('Currency'),
  ]);

  const validatePartyLabel = (index: number) => combineValidators([
    validateRequired(`Party ${index + 1} label`),
    validateMaxLength(`Party ${index + 1} label`, MAX_PARTY_LABEL_LENGTH),
  ]);

  const validatePartyAddress = (index: number) => combineValidators([
    validateRequired(`Party ${index + 1} address`),
    validateStellarAddress(`Party ${index + 1} address`),
  ]);

  /**
   * Restores this identity's draft once, when the identity becomes known.
   *
   * Restoring on every render would fight the user's typing; restoring on
   * mount only would miss a wallet connected after the form opened. The
   * identity is the dependency, so the draft is loaded exactly when the owner
   * changes — and a draft belonging to a *different* wallet is discarded and
   * reported, never shown.
   */
  useEffect(() => {
    if (!draftOwner) {
      setRestoredFor(null);
      return;
    }

    const result = loadContractDraft(draftOwner);

    if (result.status === 'restored') {
      setContractName(result.draft.contractName);
      setParties(result.draft.parties.length ? result.draft.parties : emptyParties());
      setTotalValue(result.draft.totalValue);
      if (result.draft.currency) setCurrency(result.draft.currency);
      // A restored draft has not been validated by its owner yet, so the form
      // starts clean of errors rather than red-flagged before they touch it.
      setErrors([]);
      setRestoredAt(result.savedAt || null);
      setDraftNotice('Draft restored. Continue where you left off, or discard it to start fresh.');
    } else if (result.status === 'discarded') {
      // The stored draft is unreadable or belongs to someone else. Reset the
      // visible form too: leaving the previous identity's text on screen under
      // a new wallet is the leak this feature exists to prevent.
      setContractName('');
      setParties(emptyParties());
      setTotalValue('');
      setCurrency('USD');
      setErrors([]);
      setRestoredAt(null);
      setDraftNotice(
        result.reason === 'identity-mismatch'
          ? 'A saved draft belonged to a different wallet, so it was discarded.'
          : 'A saved draft could not be read and was discarded.',
      );
    } else {
      setRestoredAt(null);
    }

    setRestoredFor(draftOwner);
  }, [draftOwner]);

  /**
   * Persists the in-progress draft as the user types.
   *
   * Skipped for a pristine form (there is nothing worth restoring) and until
   * the restore for this identity has run (see {@link restoredFor}). A failed
   * write is reported once, because a draft that only exists in memory is not
   * a draft.
   */
  useEffect(() => {
    if (!draftOwner || restoredFor !== draftOwner) return;

    const hasContent =
      contractName.trim() !== '' ||
      totalValue.trim() !== '' ||
      parties.some((party) => party.label.trim() !== '' || party.address.trim() !== '');

    if (!hasContent) return;

    const saved = saveContractDraft(draftOwner, { contractName, parties, totalValue, currency });
    if (!saved) {
      setDraftNotice('This draft could not be saved in your browser, so a refresh may lose it.');
    }
  }, [draftOwner, restoredFor, contractName, parties, totalValue, currency]);

  /**
   * Discards the saved draft and returns the form to its pristine state.
   */
  const handleDiscardDraft = useCallback(() => {
    clearContractDraft();
    setContractName('');
    setParties(emptyParties());
    setTotalValue('');
    setCurrency('USD');
    setErrors([]);
    setRestoredAt(null);
    setDraftNotice('Draft discarded.');
  }, []);

  /**
   * Validates the form data and returns an array of error objects.
   */
  const validateForm = useCallback((): Array<{ fieldId: string; message: string }> => {
    const validationErrors: Array<{ fieldId: string; message: string }> = [];

    // Validate contract name
    const sanitizedContractName = sanitizeUserText(contractName, MAX_CONTRACT_NAME_LENGTH);
    const unboundedContractName = sanitizeUserText(contractName, Number.MAX_SAFE_INTEGER);
    if (!sanitizedContractName) {
      validationErrors.push({
        fieldId: 'contractName',
        message: 'Contract name is required',
      });
    } else if (unboundedContractName.length > MAX_CONTRACT_NAME_LENGTH) {
      validationErrors.push({
        fieldId: 'contractName',
        message: `Contract name must be no more than ${MAX_CONTRACT_NAME_LENGTH} characters`,
      });
    }

    // Validate total value
    const numericValue = parseFloat(totalValue);
    if (!totalValue.trim()) {
      validationErrors.push({
        fieldId: 'totalValue',
        message: 'Total value is required',
      });
    } else if (isNaN(numericValue) || numericValue <= 0) {
      validationErrors.push({
        fieldId: 'totalValue',
        message: 'Total value must be a positive number',
      });
    }

    // Validate currency
    if (!currency.trim()) {
      validationErrors.push({
        fieldId: 'currency',
        message: 'Currency is required',
      });
    }

    // Validate parties
    const filledParties = parties.filter(
      p => sanitizeUserText(p.label, MAX_PARTY_LABEL_LENGTH) || p.address.trim(),
    );
    if (filledParties.length < 2) {
      validationErrors.push({
        fieldId: 'parties',
        message: 'At least two parties are required',
      });
    }

    // Validate individual party fields
    parties.forEach((party, index) => {
      const sanitizedLabel = sanitizeUserText(party.label, MAX_PARTY_LABEL_LENGTH);
      const unboundedLabel = sanitizeUserText(party.label, Number.MAX_SAFE_INTEGER);
      const hasLabel = sanitizedLabel;
      const hasAddress = party.address.trim();

      // If either field is filled, both must be filled
      if (hasLabel || hasAddress) {
        if (!hasLabel) {
          validationErrors.push({
            fieldId: `party-label-${index}`,
            message: `Party ${index + 1} label is required`,
          });
        }
        if (unboundedLabel.length > MAX_PARTY_LABEL_LENGTH) {
          validationErrors.push({
            fieldId: `party-label-${index}`,
            message: `Party ${index + 1} label must be no more than ${MAX_PARTY_LABEL_LENGTH} characters`,
          });
        }

        if (!hasAddress) {
          validationErrors.push({
            fieldId: `party-address-${index}`,
            message: `Party ${index + 1} address is required`,
          });
        } else if (!isValidStellarAddress(party.address)) {
          validationErrors.push({
            fieldId: `party-address-${index}`,
            message: `Party ${index + 1} address must be a valid Stellar address`,
          });
        }
      }
    });

    return validationErrors;
  }, [contractName, totalValue, currency, parties]);

  /**
   * Handles form submission, validates input, and calls onSubmit if valid.
   */
  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setHasSubmitted(true);

      const validationErrors = validateForm();
      setErrors(validationErrors);

      if (validationErrors.length > 0) {
        return;
      }

      // Filter out empty parties and construct the contract
      const validParties = parties
        .filter(p => sanitizeUserText(p.label, MAX_PARTY_LABEL_LENGTH) && p.address.trim())
        .map(p => ({
          ...p,
          label: sanitizeUserText(p.label, MAX_PARTY_LABEL_LENGTH),
        }));
      
      const contract: Contract = {
        id: crypto.randomUUID(),
        contractName: sanitizeUserText(contractName, MAX_CONTRACT_NAME_LENGTH),
        parties: validParties,
        totalValue: parseFloat(totalValue),
        currency: currency.trim(),
        status: 'Pending',
        createdAt: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        updatedAt: new Date().toISOString(),
        milestoneCount: 0,
      };

      // The draft's job ends at submission; leaving it behind would offer to
      // restore a contract that already exists.
      clearContractDraft();
      setRestoredAt(null);

      onSubmit(contract);
    },
    [contractName, totalValue, currency, parties, validateForm, onSubmit]
  );

  // Check if the form has validation errors to disable submit button
  const hasErrors = () => {
    if (!hasSubmitted) return false;
    const validationErrors = validateForm();
    return validationErrors.length > 0;
  };

  /**
   * Updates a specific party's field value.
   */
  const updateParty = useCallback((index: number, field: 'label' | 'address', value: string) => {
    setParties(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  /**
   * Adds a new empty party to the form.
   */
  const addParty = useCallback(() => {
    setParties(prev => [...prev, { label: '', address: '' }]);
  }, []);

  /**
   * Removes a party at the specified index.
   */
  const removeParty = useCallback((index: number) => {
    setParties(prev => prev.filter((_, i) => i !== index));
  }, []);

  const getFieldError = (fieldId: string): string | undefined => {
    return errors.find(e => e.fieldId === fieldId)?.message;
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-labelledby="create-contract-title"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <h2 id="create-contract-title" className="text-2xl font-bold text-slate-900 mb-6">
          Create New Contract
        </h2>

        {draftNotice && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          >
            <span>
              {draftNotice}
              {restoredAt ? ` (saved ${new Date(restoredAt).toLocaleString()})` : ''}
            </span>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="rounded font-medium text-blue-700 underline hover:text-blue-900 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Discard draft
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <ErrorSummary errors={errors} />

          <FormField
            label="Contract Name"
            id="contractName"
            error={getFieldError('contractName')}
            validate={validateContractNameField}
            required
          >
            <input
              ref={firstFieldRef}
              type="text"
              value={contractName}
              onChange={e => setContractName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Website Redesign Project"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Total Value"
              id="totalValue"
              error={getFieldError('totalValue')}
              validate={validateTotalValueField}
              required
            >
              <input
                type="text"
                value={totalValue}
                onChange={e => setTotalValue(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 5000"
              />
            </FormField>

            <FormField
              label="Currency"
              id="currency"
              error={getFieldError('currency')}
              validate={validateCurrencyField}
              required
            >
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="XLM">XLM</option>
              </select>
            </FormField>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parties <span className="text-red-500 ml-1" aria-hidden="true">*</span>
            </label>
            {getFieldError('parties') && (
              <p id="parties-error" className="mb-2 text-sm text-red-600 font-medium" role="alert">
                {getFieldError('parties')}
              </p>
            )}
            <div className="space-y-4">
              {parties.map((party, index) => (
                <div key={index} className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">Party {index + 1}</h3>
                    {parties.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeParty(index)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-500 rounded"
                        aria-label={`Remove party ${index + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <FormField
                    label="Label"
                    id={`party-label-${index}`}
                    error={getFieldError(`party-label-${index}`)}
                    validate={validatePartyLabel(index)}
                    required
                  >
                    <input
                      type="text"
                      value={party.label}
                      onChange={e => updateParty(index, 'label', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Client, Freelancer"
                    />
                  </FormField>

                  <FormField
                    label="Stellar Address"
                    id={`party-address-${index}`}
                    error={getFieldError(`party-address-${index}`)}
                    helperText="56-character address starting with G"
                    validate={validatePartyAddress(index)}
                    required
                  >
                    <input
                      type="text"
                      value={party.address}
                      onChange={e => updateParty(index, 'address', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    />
                  </FormField>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addParty}
              className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
            >
              + Add Another Party
            </button>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={hasSubmitted && hasErrors()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Contract
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
