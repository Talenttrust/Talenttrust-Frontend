'use client';

import React, { memo } from 'react';
import type { Contract } from '@/types/domain';
import type { ContractsDensity } from '@/lib/preferences';

export interface ContractListItemProps {
  contract: Contract;
  index: number;
  /** Controls spacing inside the card. Defaults to 'comfortable'. */
  density?: ContractsDensity;
}

/**
 * ContractListItem renders a single contract in a list.
 *
 * Memoized with React.memo to prevent re-renders when the contract and index
 * props haven't changed. This is critical for performance when rendering large
 * contract lists, as parent re-renders due to unrelated state changes (e.g.,
 * showForm toggle) will not cause each list item to re-render unnecessarily.
 *
 * @param props - Component props
 * @param props.contract - The contract record to display
 * @param props.index - The index of the contract in the list (used for key)
 * @param props.density - Optional density override ('comfortable' | 'compact')
 *
 * @example
 * ```tsx
 * <ContractListItem contract={contract} index={0} density="compact" />
 * ```
 */
const ContractListItem = memo(
  ({ contract, index, density = 'comfortable' }: ContractListItemProps) => {
    const isCompact = density === 'compact';
    return (
      <li
        key={`${contract.contractName}-${index}`}
        className={`rounded-3xl border border-slate-200 bg-white shadow-sm transition-[padding] ${
          isCompact ? 'p-2.5' : 'p-4'
        }`}
      >
        <p className="font-semibold text-slate-900">{contract.contractName}</p>
        <p className={`text-sm text-slate-500 ${isCompact ? 'mt-0.5' : 'mt-1'}`}>
          {contract.status} · Created {contract.createdAt}
        </p>
      </li>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check: return true if props are equal (don't re-render)
    return (
      prevProps.contract.contractName === nextProps.contract.contractName &&
      prevProps.contract.status === nextProps.contract.status &&
      prevProps.contract.createdAt === nextProps.contract.createdAt &&
      prevProps.index === nextProps.index &&
      prevProps.density === nextProps.density
    );
  },
);

ContractListItem.displayName = 'ContractListItem';

export default ContractListItem;
