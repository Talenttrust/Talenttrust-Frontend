"use client";

import { FormEvent, useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from "next/link";
import { api, ApiError, ApiSchemaError, EscrowContract, Reputation, unwrapContract, unwrapReputation } from "@/lib/api";
import { ContractListSchema, EscrowContractSchema } from '@/lib/schemas';
import { contractsReducer, type OptimisticAction } from "@/lib/optimistic";
import { StarRating } from "@/components/reputation/StarRating";
import { ResolveDisputeForm } from "@/components/disputes/ResolveDisputeForm";
import { useIsArbiter } from "@/lib/stellar/useIsArbiter";
import { applyQuery, ContractQuery, DEFAULT_QUERY, filterContracts, parseQuery, toSearchParams } from '@/lib/contractQuery';
import { EscrowToolbar } from './escrow/EscrowToolbar';
import { Pagination } from './escrow/Pagination';
import { ExportMenu } from "./escrow/ExportMenu";
import { DisputeDialog } from "./disputes/DisputeDialog";
import { EscrowCard } from "./escrow/EscrowCard";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useOptionalContractStatus } from "@/components/ContractStatusProvider";
import { assertNotPaused } from "@/lib/stellar/status";
import { normalizeAddress } from "@/lib/stellar/address";
import { AddressInput, type AddressInputHandle } from "@/components/forms/AddressInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { WatchToggle } from "@/components/WatchToggle";
import { OnchainCreateForm } from "./escrow/OnchainCreateForm";
import {
  MilestoneBuilder,
  newMilestone,
  validateMilestones,
  type MilestoneInput,
  type MilestoneValidation,
} from "@/components/MilestoneBuilder";
import { ViewFilterControl } from "./ViewFilterControl";
import { RoleChip } from "./RoleChip";
import { getAddress } from "@/lib/stellar/freighter";
import type { ViewFilter } from "@/lib/api";

/** Coerce any string from the URL into a valid ViewFilter, defaulting to "all". */
function toViewFilter(raw: string | null): ViewFilter {
  if (raw === "client" || raw === "freelancer") return raw;
  return "all";
}
import { useOptionalToast } from "@/components/toast/ToastProvider";

const asContract = (payload: unknown): EscrowContract | null => {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as { data?: EscrowContract; id?: number };
  if (obj.data && typeof obj.data.id === "number") return obj.data;
  if (typeof obj.id === "number") return payload as EscrowContract;
  return null;
};

function EscrowCardSkeleton() {
  return (
    <div className="card skeleton-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Skeleton width="55%" height="1.2em" />
        <Skeleton width={84} height={22} radius={999} />
      </div>
      <Skeleton width="75%" />
      <Skeleton variant="block" width="100%" height={8} radius={999} />
      <Skeleton width="60%" />
      <div className="stack" style={{ gap: 8, margin: '12px 0' }}>
        <Skeleton width="80%" />
        <Skeleton width="65%" />
      </div>
      <div className="row">
        <Skeleton variant="block" width={110} height={34} />
        <Skeleton variant="block" width={110} height={34} />
      </div>
    </div>
  );
}

export function EscrowDashboard() {
  const confirm = useConfirm();
  const toast = useOptionalToast();
  const isArbiter = useIsArbiter();
  const contractStatus = useOptionalContractStatus()?.status;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  // "My escrows": All / As client / As freelancer, persisted as ?view=
  const view = toViewFilter(searchParams.get("view"));
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getAddress()
      .then((address) => active && setWalletAddress(address || null))
      .catch(() => active && setWalletAddress(null));
    return () => {
      active = false;
    };
  }, []);
  // Role views only apply once a wallet is connected.
  const roleView: ViewFilter = walletAddress ? view : "all";
  // Only refetch when the server-side filter actually changes.
  const party = roleView !== "all" && walletAddress ? walletAddress : null;
  const [search, setSearch] = useState(query.q);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const disputeTriggerRef = useRef<HTMLButtonElement>(null);
  const [disputeContract, setDisputeContract] = useState<EscrowContract | null>(
    null,
  );
  const [contracts, setContracts] = useState<EscrowContract[] | null>(null);
  // Release and Fund update the card instantly via useOptimistic; React drops
  // the optimistic state when the transition settles, so a failure rolls back.
  const [optimisticContracts, dispatchOptimistic] = useOptimistic(contracts ?? [], contractsReducer);
  const [, startTransition] = useTransition();
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
  const pendingRef = useRef<Set<number>>(new Set());
  const [cardErrors, setCardErrors] = useState<Record<number, { message: string; detail?: string }>>({});
  const retryRef = useRef<Record<number, () => void>>({});
  const [error, setError] = useState<{
    message: string;
    detail?: string;
  } | null>(null);
  const [schemaError, setSchemaError] = useState<ApiSchemaError | null>(null);
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [rated, setRated] = useState<Record<number, Reputation>>({});
  const [ratingErrors, setRatingErrors] = useState<Record<number, string>>({});
  const loadController = useRef<AbortController | null>(null);
  const [crossFieldError, setCrossFieldError] = useState<string | null>(null);
  const clientRef = useRef<AddressInputHandle>(null);
  const freelancerRef = useRef<AddressInputHandle>(null);
  const [form, setForm] = useState({
    title: 'Website redesign',
    client: '',
    freelancer: '',
  });
  const [milestoneRows, setMilestoneRows] = useState<MilestoneInput[]>(() => [
    newMilestone("Design", "300"),
    newMilestone("Build", "700"),
  ]);
  const [milestoneErrors, setMilestoneErrors] = useState<MilestoneValidation | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Create through the demo API, or sign create_contract on testnet with Freighter.
  const [createMode, setCreateMode] = useState<"demo" | "onchain">("demo");

  // Status is filtered by the API, the rest is done client-side
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      // Status is filtered by the API; a role view also pre-filters by ?party=
      // (the wallet as client OR freelancer) and is tightened client-side.
      const params = new URLSearchParams();
      if (party) params.set("party", party);
      if (query.status) params.set("status", query.status);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await api(`/api/v1/contracts${qs}`, ContractListSchema, { signal: controller.signal });
      setContracts(res.data.sort((a, b) => b.id - a.id));
      setError(null);
      setSchemaError(null);
    } catch (e) {
      if (e instanceof ApiSchemaError) {
        setSchemaError(e);
        setError(null);
      } else if (e instanceof ApiError && e.kind === 'aborted') {
        return;
      } else {
        const detail = e instanceof ApiError ? e.message : (e as Error).message;
        setError({ message: e instanceof ApiError ? e.userMessage : `Could not reach the API: ${detail}`, detail });
      }
      setContracts([]);
    }
  }, [query.status, party]);

  useEffect(() => {
    load();
    return () => loadController.current?.abort();
  }, [load]);

  const update = useCallback(
    (patch: Partial<ContractQuery>) => {
      const params = toSearchParams({ ...query, page: 1, ...patch });
      if (view !== "all") params.set("view", view);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [query, view, router, pathname],
  );

  const changeView = useCallback(
    (next: ViewFilter) => {
      const params = toSearchParams({ ...query, page: 1 });
      if (next !== "all") params.set("view", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [query, router, pathname],
  );

  const byRole = useCallback(
    (list: EscrowContract[]) =>
      roleView === "all" || !walletAddress
        ? list
        : list.filter((c) => (roleView === "client" ? c.client === walletAddress : c.freelancer === walletAddress)),
    [roleView, walletAddress],
  );

  const roleFor = (c: EscrowContract): "client" | "freelancer" | null => {
    if (!walletAddress) return null;
    if (c.client === walletAddress) return "client";
    if (c.freelancer === walletAddress) return "freelancer";
    return null;
  };

  useEffect(() => {
    setSearch(query.q);
  }, [query.q]);

  useEffect(() => {
    if (search.trim() === query.q) return;
    const t = setTimeout(() => update({ q: search.trim() }), 250);
    return () => clearTimeout(t);
  }, [search, query.q, update]);

  const result = useMemo(
    () => applyQuery(contracts === null ? [] : byRole(optimisticContracts), query),
    [contracts, optimisticContracts, query, byRole],
  );
  const visible = useMemo(
    () => (contracts ? filterContracts(byRole(contracts), query) : null),
    [contracts, query, byRole],
  );
  const filtered = query.status !== "" || query.q !== "";

  const goToPage = (page: number) => {
    update({ page });
    headingRef.current?.focus();
  };

  const clearFilters = () => {
    setSearch("");
    update(DEFAULT_QUERY);
  };

  const act = async (
    id: number | "new",
    fn: () => Promise<unknown>,
    messages?: { pending: string; success: string },
    onSuccess?: (result: unknown) => void,
  ) => {
    try {
      assertNotPaused({ status: contractStatus });
    } catch (e) {
      setError({ message: (e as Error).message });
      setAnnouncement(`Error: ${(e as Error).message}`);
      return;
    }

    setBusy(id);
    setError(null);
    setSchemaError(null);
    if (messages) setAnnouncement(messages.pending);
    try {
      const result = await fn();
      // Write the returned contract into local state; only fall back to a
      // full reload when the response does not contain a contract.
      const updated = unwrapContract(result);
      if (updated) {
        setContracts((prev) => {
          if (!prev) return [updated];
          const exists = prev.some((c) => c.id === updated.id);
          return exists ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated, ...prev];
        });
      } else {
        // Endpoints that don't return a contract (e.g. rate) require a refresh.
        await load();
      }
      if (messages) setAnnouncement(messages.success);
      onSuccess?.(result);
    } catch (e) {
      if (e instanceof ApiSchemaError) {
        setSchemaError(e);
      } else if (e instanceof ApiError && e.kind === 'aborted') {
        return;
      } else {
        const detail = e instanceof ApiError ? e.message : (e as Error).message;
        const message = e instanceof ApiError ? e.userMessage : detail;
        setError({ message, detail });
        setAnnouncement(`Error: ${message}`);
        toast.error(detail);
      }
    } finally {
      setBusy(null);
    }
  };

  const setPending = (id: number, on: boolean) => {
    const next = new Set(pendingRef.current);
    if (on) next.add(id);
    else next.delete(id);
    pendingRef.current = next;
    setPendingIds(next);
  };
}
