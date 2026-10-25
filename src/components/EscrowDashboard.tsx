"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { contractsReducer, type OptimisticAction } from "@/lib/optimistic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError, EscrowContract, Reputation, unwrapContract, unwrapReputation } from "@/lib/api";
import { StarRating } from "@/components/reputation/StarRating";
import { ResolveDisputeForm } from "@/components/disputes/ResolveDisputeForm";
import { useIsArbiter } from "@/lib/stellar/useIsArbiter";
import {
  applyQuery,
  ContractQuery,
  DEFAULT_QUERY,
  filterContracts,
  parseQuery,
  toSearchParams,
} from "@/lib/contractQuery";
import { EscrowToolbar } from "./escrow/EscrowToolbar";
import { Pagination } from "./escrow/Pagination";
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
      .then((address) => active && setWalletAddress(address))
      .catch(() => active && setWalletAddress(null));
    return () => {
      active = false;
    };
  }, []);
  // Role views only apply once a wallet is connected.
  const roleView: ViewFilter = walletAddress ? view : "all";
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
    milestones: 'Design: 300, Build: 700',
  });

  // Status is filtered by the API, the rest is done client-side
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      // Status is filtered by the API; a role view also pre-filters by ?party=
      // (the wallet as client OR freelancer) and is tightened client-side.
      const params = new URLSearchParams();
      if (roleView !== "all" && walletAddress) params.set("party", walletAddress);
      if (query.status) params.set("status", query.status);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await api<{ data: EscrowContract[] }>(
        `/api/v1/contracts${qs}`,
        { signal: controller.signal },
      );
      setContracts(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "aborted") return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      setError({
        message:
          e instanceof ApiError
            ? e.userMessage
            : `Could not reach the API: ${detail}`,
        detail,
      });
      setContracts([]);
    }
  }, [query.status, roleView, walletAddress]);

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
      if (e instanceof ApiError && e.kind === "aborted") return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      const message = e instanceof ApiError ? e.userMessage : detail;
      setError({ message, detail });
      setAnnouncement(`Error: ${message}`);
      toast.error(detail);
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

  /**
   * Optimistic Release / Fund: the card updates immediately, the request runs
   * inside an async transition, and on success the server response wins. On
   * failure the optimistic state is discarded and a card-local error with a
   * Retry button is shown.
   */
  const optimisticAct = (
    contractId: number,
    action: OptimisticAction,
    fn: () => Promise<unknown>,
    messages: { pending: string; success: string },
    onSuccess?: () => void,
  ) => {
    if (pendingRef.current.has(contractId)) return; // no double-submit
    try {
      assertNotPaused({ status: contractStatus });
    } catch (e) {
      setCardErrors((prev) => ({ ...prev, [contractId]: { message: (e as Error).message } }));
      setAnnouncement(`Error: ${(e as Error).message}`);
      return;
    }
    retryRef.current[contractId] = () => optimisticAct(contractId, action, fn, messages, onSuccess);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[contractId];
      return next;
    });
    setAnnouncement(messages.pending);
    setPending(contractId, true);
    startTransition(async () => {
      dispatchOptimistic(action);
      try {
        const response = await fn();
        const updated = unwrapContract(response);
        if (updated) {
          startTransition(() => {
            setContracts((prev) => (prev ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated]));
          });
        } else {
          await load();
        }
        setAnnouncement(messages.success);
        onSuccess?.();
      } catch (e) {
        if (e instanceof ApiError && e.kind === "aborted") return;
        const detail = e instanceof ApiError ? e.message : (e as Error).message;
        const message = e instanceof ApiError ? e.userMessage : detail || "Action failed. Please retry.";
        setCardErrors((prev) => ({ ...prev, [contractId]: { message, detail } }));
        setAnnouncement(`Error: ${message}`);
        toast.error(detail);
      } finally {
        setPending(contractId, false);
      }
    });
  };

  // Arbiter-only resolution with a chosen split. Errors are re-thrown so the
  // form can show them next to its controls.
  const resolveDispute = async (c: EscrowContract, freelancerBps: number) => {
    assertNotPaused({ status: contractStatus });
    setBusy(c.id);
    setAnnouncement("Resolving dispute…");
    try {
      const response = await api(`/api/v1/contracts/${c.id}/resolve`, {
        method: "POST",
        body: { freelancerBps },
      });
      const updated = unwrapContract(response);
      if (updated) {
        setContracts((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : [updated]));
      } else {
        await load();
      }
      setAnnouncement("Dispute resolved");
      toast.success(`Escrow #${c.id} resolved`);
    } catch (e) {
      const message = e instanceof ApiError ? e.userMessage : (e as Error).message;
      setAnnouncement(`Error: ${message}`);
      throw new Error(message);
    } finally {
      setBusy(null);
    }
  };

  // Rating has its own flow: the endpoint returns a Reputation (not a contract)
  // and errors are shown inline on the card so they survive a list refresh.
  const rate = async (c: EscrowContract, rating: number) => {
    try {
      assertNotPaused({ status: contractStatus });
    } catch (e) {
      setRatingErrors((prev) => ({ ...prev, [c.id]: (e as Error).message }));
      return;
    }
    setBusy(c.id);
    setRatingErrors((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
    setAnnouncement("Submitting rating…");
    try {
      const reputation = await api<Reputation>(`/api/v1/contracts/${c.id}/reputation`, {
        method: "POST",
        body: { rating },
      }).then(unwrapReputation);
      if (reputation) setRated((prev) => ({ ...prev, [c.id]: reputation }));
      await load();
      setAnnouncement("Rating submitted");
      toast.success(`Rating submitted for escrow #${c.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "aborted") return;
      // Show the API detail (e.g. "already rated") inline on the card.
      const message = (e as Error).message;
      setRatingErrors((prev) => ({ ...prev, [c.id]: message }));
      setAnnouncement(`Error: ${message}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const viewEscrow = (id: number) => {
    const el = document.getElementById(`escrow-${id}`);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    setCrossFieldError(null);

    const clientOk = clientRef.current?.validate() ?? false;
    const freelancerOk = freelancerRef.current?.validate() ?? false;
    if (!clientOk) {
      clientRef.current?.focus();
      return;
    }
    if (!freelancerOk) {
      freelancerRef.current?.focus();
      return;
    }

    const client = normalizeAddress(form.client);
    const freelancer = normalizeAddress(form.freelancer);
    if (client === freelancer) {
      setCrossFieldError('Client and freelancer must be different addresses.');
      freelancerRef.current?.focus();
      return;
    }

    const milestones = form.milestones
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part, i) => {
        const [title, amount] = part.includes(":")
          ? part.split(":")
          : [`Milestone ${i + 1}`, part];
        return { title: title.trim(), amount: Number(amount) };
      });
    act("new", () =>
      api('/api/v1/contracts', {
        method: 'POST',
        body: { title: form.title, client, freelancer, milestones },
      }),
      { pending: "Creating escrow…", success: "Escrow created" },
      (result) => {
        const created = asContract(result);
        if (created?.id) {
          toast.success(`Escrow #${created.id} created`, {
            action: { label: "View escrow", onClick: () => viewEscrow(created.id) },
          });
        } else {
          toast.success("Escrow created");
        }
      },
    );
  };

  return (
    <div className="dash">
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="escrow-live-announcer"
      >
        {announcement}
      </div>

      <section aria-labelledby="create-escrow-heading">
        <h2 id="create-escrow-heading" className="sr-only">
          Create escrow
        </h2>
        <form
          className="card form"
          onSubmit={create}
          aria-labelledby="new-escrow"
          aria-busy={busy === "new"}
        >
          <h3 id="new-escrow">New escrow</h3>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <AddressInput
            ref={clientRef}
            id="client"
            label="Client address"
            value={form.client}
            onChange={(client) => setForm((current) => ({ ...current, client }))}
            placeholder="G... Stellar account address"
            description="56 characters, starting with G. Checksum is verified before submitting."
          />
          <AddressInput
            ref={freelancerRef}
            id="freelancer"
            label="Freelancer address"
            value={form.freelancer}
            onChange={(freelancer) => {
              setCrossFieldError(null);
              setForm((current) => ({ ...current, freelancer }));
            }}
            placeholder="G... Stellar account address"
            description="Must be a different account from the client."
            error={crossFieldError}
          />
          <div className="field">
            <label htmlFor="milestones">Milestones</label>
            <input
              id="milestones"
              className="input"
              value={form.milestones}
              onChange={(e) => setForm({ ...form, milestones: e.target.value })}
              required
            />
            <span className="small muted">Comma separated, as Title: amount</span>
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy === "new"}
          >
            {busy === "new" ? "Creating..." : "Create escrow"}
          </button>
        </form>
      </section>

      <section className="stack" style={{ minWidth: 0 }} aria-labelledby="escrow-list">
        <div className="row list-actions">
          <ExportMenu contracts={visible} />
        </div>
        <ViewFilterControl value={roleView} onChange={changeView} walletConnected={Boolean(walletAddress)} />
        {error && (
          <div className="alert alert-error" role="alert" title={error.detail}>
            {error.message}{" "}
            <Link href="/status" className="alert-link">
              See system status
            </Link>
          </div>
        )}
        <h2
          id="escrow-list"
          className="list-heading"
          ref={headingRef}
          tabIndex={-1}
        >
          Escrows
        </h2>
        <EscrowToolbar
          status={query.status}
          sort={query.sort}
          search={search}
          onStatusChange={(status) => update({ status })}
          onSortChange={(sort) => update({ sort })}
          onSearchChange={setSearch}
        />
        <p
          className="small muted"
          role="status"
          aria-live="polite"
          style={{ margin: 0 }}
        >
          {contracts !== null &&
            !error &&
            result.total > 0 &&
            `Showing ${result.from}–${result.to} of ${result.total} escrows`}
        </p>
        {contracts === null && (
          <div className="skeleton-cards" role="status" aria-live="polite">
            <span className="sr-only">Loading…</span>
            {[0, 1, 2].map((i) => (
              <EscrowCardSkeleton key={i} />
            ))}
          </div>
        )}
        {contracts !== null &&
          result.total === 0 &&
          !error &&
          (filtered ? (
            <div
              className="card row empty"
              style={{ justifyContent: "space-between" }}
            >
              <span className="muted">No escrows match these filters.</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="card muted">
              {roleView === "client"
                ? "You have no escrows as client yet."
                : roleView === "freelancer"
                  ? "You have no escrows as freelancer yet."
                  : "No escrows yet. Create the first one."}
            </div>
          ))}
        {result.items.map((c) => (
          <EscrowCard
            key={c.id}
            contract={c}
            busy={busy === c.id || pendingIds.has(c.id)}
            optimistic={pendingIds.has(c.id)}
            error={cardErrors[c.id] ?? null}
            onRetry={() => retryRef.current[c.id]?.()}
            headerActions={
              <>
                {roleFor(c) && <RoleChip role={roleFor(c)!} />}
                <WatchToggle contract={c} />
              </>
            }
            extraActions={
              (c.status === "Completed" || c.status === "Resolved" || c.status === "Cancelled") && (
                <Link href={`/contracts/${c.id}/statement`} className="btn btn-secondary btn-sm">
                  Statement
                </Link>
              )
            }
            onFund={(contract, amount) =>
              optimisticAct(
                contract.id,
                { type: "deposit", contractId: contract.id, amount },
                () =>
                  api(`/api/v1/contracts/${contract.id}/deposit`, {
                    method: "POST",
                    body: { amount },
                  }),
                { pending: `Funding escrow #${contract.id}…`, success: `Escrow #${contract.id} funded` },
                () => toast.success(`Escrow #${contract.id} funded`),
              )
            }
            onReleaseNext={(contract, milestoneIndex) =>
              optimisticAct(
                contract.id,
                { type: "release", contractId: contract.id, milestoneIndex },
                () =>
                  api(`/api/v1/contracts/${contract.id}/milestones/${milestoneIndex}/release`, {
                    method: "POST",
                  }),
                { pending: "Releasing milestone…", success: "Milestone released" },
                () => toast.success(`Escrow #${contract.id}: milestone released`),
              )
            }
            onDispute={(contract, trigger) => {
              disputeTriggerRef.current = trigger;
              setDisputeContract(contract);
            }}
            onCancel={async (contract) => {
              const held = contract.fundedAmount - contract.releasedAmount;
              const confirmed = await confirm({
                title: `Cancel escrow #${contract.id}?`,
                description: `Refund ${held} ${contract.token} to the client and close escrow #${contract.id}. This cannot be undone.`,
                tone: "danger",
                confirmLabel: "Cancel escrow",
                cancelLabel: "Keep escrow",
                requireText: held > 0 ? String(contract.id) : undefined,
              });
              if (confirmed) {
                act(
                  contract.id,
                  () => api(`/api/v1/contracts/${contract.id}/cancel`, { method: "POST" }),
                  { pending: "Cancelling escrow…", success: "Escrow cancelled" },
                  () => toast.success(`Escrow #${contract.id} cancelled`),
                );
              }
            }}
            onResolve={(contract) =>
              act(
                contract.id,
                () =>
                  api(`/api/v1/contracts/${contract.id}/resolve`, {
                    method: "POST",
                    body: { freelancerBps: 5000 },
                  }),
                { pending: "Resolving dispute…", success: "Dispute resolved" },
                () => toast.success(`Escrow #${contract.id} resolved`),
              )
            }
            resolveSlot={
              c.status === "Disputed" ? (
                isArbiter === true ? (
                  <ResolveDisputeForm
                    id={c.id}
                    held={c.fundedAmount - c.releasedAmount}
                    token={c.token}
                    busy={busy === c.id}
                    onResolve={(freelancerBps) => resolveDispute(c, freelancerBps)}
                  />
                ) : (
                  <DisputeWaiting contract={c} checking={isArbiter === null} />
                )
              ) : undefined
            }
            ratingSlot={
              c.status === "Completed" ? (
                <>
                  {!c.reputationIssued && !rated[c.id] && (
                    <StarRating onSubmit={(rating) => rate(c, rating)} disabled={busy === c.id} />
                  )}
                  {rated[c.id] && (
                    <p className="small rate-note">
                      New average: {rated[c.id].averageRating} / 5 across {rated[c.id].completedContracts}{" "}
                      <Link href={`/reputation?address=${encodeURIComponent(c.freelancer)}`}>View reputation</Link>
                    </p>
                  )}
                  {c.reputationIssued && !rated[c.id] && <span className="small muted">Rated. Thanks!</span>}
                  {ratingErrors[c.id] && (
                    <div className="alert alert-error small" role="alert" style={{ flex: "1 1 100%", margin: 0 }}>
                      {ratingErrors[c.id]}
                    </div>
                  )}
                </>
              ) : undefined
            }
          />
        ))}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          onPageChange={goToPage}
        />
      </section>
      {disputeContract && (
        <DisputeDialog
          contract={disputeContract}
          triggerRef={disputeTriggerRef}
          onClose={() => setDisputeContract(null)}
          onSuccess={async () => {
            const id = disputeContract.id;
            await load();
            toast.success(`Escrow #${id} disputed`);
          }}
        />
      )}
    </div>
  );
}

function DisputeWaiting({ contract, checking }: { contract: EscrowContract; checking: boolean }) {
  const openedAt = contract.dispute?.openedAt ?? contract.disputeOpenedAt ?? contract.disputedAt;
  const valid = openedAt && !Number.isNaN(Date.parse(openedAt));
  return (
    <p className="small muted resolve-waiting">
      <span className="badge">{checking ? "Checking arbiter access" : "Awaiting arbiter decision"}</span>
      {valid && (
        <time dateTime={openedAt} aria-label="Dispute opened">
          Opened {new Date(openedAt).toLocaleString()}
        </time>
      )}
    </p>
  );
}
