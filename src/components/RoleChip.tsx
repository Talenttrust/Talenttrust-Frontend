'use client';

interface RoleChipProps {
  role: 'client' | 'freelancer';
}

/**
 * Small pill badge shown on a contract card when the connected wallet
 * matches the client or freelancer address.
 */
export function RoleChip({ role }: RoleChipProps) {
  const label = role === 'client' ? 'You are the client' : 'You are the freelancer';
  return (
    <span className={`role-chip role-chip--${role}`} aria-label={label}>
      {label}
    </span>
  );
}
