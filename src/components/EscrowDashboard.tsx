"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, EscrowContract, listContracts, ViewFilter } from "@/lib/api";
import {
  applyQuery,
  ContractQuery,
  DEFAULT_QUERY,
  filterContracts,
  parseQuery,
  toSearchParams,
} from "@/lib/contractQuery";
import { getAddress } from "@/lib/stellar/freighter";
import { EscrowToolbar } from "./escrow/EscrowToolbar";
import { Pagination } from "./escrow/Pagination";
import { ExportMenu } from "./escrow/ExportMenu";
import { DisputeDialog } from "./disputes/DisputeDialog";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useOptionalContractStatus } from "@/components/ContractStatusProvider";
import { assertNotPaused } from "@/lib/stellar/status";
import { normalizeAddress } from "@/lib/stellar/address";
import { AddressInput, type AddressInputHandle } from "@/components/forms/AddressInput";
import { ViewFilterControl } from "./ViewFilterControl";
import { RoleChip } from "./RoleChip";

const short = (a: string) =>
  a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;

/** Coerce any string from the URL into a valid ViewFilter, defaulting to 'all'. */
function toViewFilter(raw: string | null): ViewFilter {
  if (raw === "client" || raw === "freelancer") return raw;
  return "all";
}

export function EscrowDashboard() {
  const confirm = useConfirm();
  const contractStatus = useOptionalContractStatus()?.status;
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // ── wallet ──────────────────────────────────────────────────────────────────
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  useEffect(() => {
    getAddress().then(setWalletAddress).catch(() => setWalletAddress(null));
  }, []);

  // ── view filter (URL-persisted) ──────────────────────────────────────────
  const view = toViewFilter(searchParams.get("view"));

  const handleViewChange = useCallback(
    (next: ViewFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") {
        params.delete("view");
      } else {
        params.set("view", next);
      }
      router.replace(`/contracts${params.toString() ? `?${params.toString()}` : ""}`);
    },
    [router, searchParams],
  );

  // ── search/sort/status filter (URL-persisted) ──────────────────────────────
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [search, setSearch] = useState(query.q);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const disputeTriggerRef = useRef<HTMLButtonElement>(null);
  const [disputeContract, setDisputeContract] = useState<EscrowContract | null>(null);

  // ── contract list ────────────────────────────────────────────────────────
  const [contracts, setContracts] = useState<EscrowContract[] | null>(null);
  const [error, setError] = useState<{
    message: string;
    detail?: string;
  } | null>(null);
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const [crossFieldError, setCrossFieldError] = useState<string | null>(null);
  const clientRef = useRef<AddressInputHandle>(null);
  const freelancerRef = useRef<AddressInputHandle>(null);
  const [form, setForm] = useState({
    title: "Website redesign",
    client: "",
    freelancer: "",
    milestones: "Design: 300, Build: 700",
  });

  const latestView = useRef(view);
  latestView.current = view;

  // Status is filtered by the API, the rest is done client-side
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;

    // When a wallet-role view is selected, pass ?party= so the backend
    // pre-filters. Client-side we then tighten by exact role match.
    const party =
      view !== "all" && walletAddress ? walletAddress : undefined;

    try {
      const qs = query.status
        ? `?status=${encodeURIComponent(query.status)}`
        : "";
      const res = await api<{ data: EscrowContract[] }>(
        `/api/v1/contracts${qs}`,
        { signal: controller.signal },
      );
      let data = Array.isArray(res.data) ? res.data : [];

      // If the view changed while this fetch was in-flight, discard.
      if (latestView.current !== view) return;
      if (controller.signal.aborted) return;

      // Client-side tighten: party matches either role; we keep only the one
      // matching the selected view.
      const filtered =
        view === "all" || !walletAddress
          ? data
          : data.filter((c) =>
              view === "client"
                ? c.client === walletAddress
                : c.freelancer === walletAddress,
            );

      setContracts(filtered.sort((a, b) => b.id - a.id));
      setError(null);
    } catch (e) {
      if (latestView.current !== view) return;
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
  }, [query.status, view, walletAddress]);

  useEffect(() => {
    // Reset the list on every view/wallet change so we never flash stale data.
    setContracts(null);
    load();
    return () => loadController.current?.abort();
  }, [load]);

  const update = useCallback(
    (patch: Partial<ContractQuery>) => {
      const qs = toSearchParams({ ...query, page: 1, ...patch }).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [query, router, pathname],
  );

  useEffect(() => {
    setSearch(query.q);
  }, [query.q]);

  useEffect(() => {
    if (search.trim() === query.q) return;
    const t = setTimeout(() => update({ q: search.trim() }), 250);
    return () => clearTimeout(t);
  }, [search, query.q, update]);

  const result = useMemo(
    () => applyQuery(contracts ?? [], query),
    [contracts, query],
  );
  const visible = useMemo(
    () => (contracts ? filterContracts(contracts, query) : null),
    [contracts, query],
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

  const act = async (id: number | "new", fn: () => Promise<unknown>) => {
    try {
      assertNotPaused({ status: contractStatus });
    } catch (e) {
      setError({ message: (e as Error).message });
      return;
    }

    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.kind === "aborted") return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      setError({
        message: e instanceof ApiError ? e.userMessage : detail,
        detail,
      });
    } finally {
      setBusy(null);
    }
  };

  // ── form ──────────────────────────────────────────────────────────────────

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
      setCrossFieldError("Client and freelancer must be different addresses.");
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
      api("/api/v1/contracts", {
        method: "POST",
        body: { title: form.title, client, freelancer, milestones },
      }),
    );
  };

  // ── empty-state copy per view ────────────────────────────────────────────
  const emptyMessage =
    view === "client"
      ? "You have no escrows as client yet."
      : view === "freelancer"
      ? "You have no escrows as freelancer yet."
      : "No escrows yet. Create the first one.";

  // ── role helper ───────────────────────────────────────────────────────────
  const roleFor = (c: EscrowContract): "client" | "freelancer" | null => {
    if (!walletAddress) return null;
    if (c.client === walletAddress) return "client";
    if (c.freelancer === walletAddress) return "freelancer";
    return null;
  };

  return (
    <div className="dash">
      <form
        className="card form"
        onSubmit={create}
        aria-labelledby="new-escrow"
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

      {/* ── contract list ── */}
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="row list-actions">
          <ExportMenu contracts={visible} />
        </div>

        {/* View filter */}
        <ViewFilterControl
          value={view}
          onChange={handleViewChange}
          walletConnected={Boolean(walletAddress)}
        />

        {/* Error banner */}
        {error && (
          <div className="alert alert-error" role="alert" title={error.detail}>
            {error.message}
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
          <div className="card muted">Loading escrows...</div>
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
            <div className="card muted" data-testid="empty-state">
              {emptyMessage}
            </div>
          ))}
        {result.items.map((c) => {
          const next = c.milestones.find((m) => !m.released);
          const active = c.status === "Created" || c.status === "Funded";
          const pct = c.totalAmount
            ? Math.round((c.releasedAmount / c.totalAmount) * 100)
            : 0;
          const role = roleFor(c);

          return (
            <article className="card" key={c.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 style={{ margin: 0 }}>
                  #{c.id} {c.title}
                </h3>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {role && <RoleChip role={role} />}
                  <span className={`badge badge-${c.status}`}>{c.status}</span>
                </div>
              </div>
              <p className="small muted" style={{ margin: "6px 0 12px" }}>
                Client <span className="mono">{short(c.client)}</span> &rarr;
                Freelancer <span className="mono">{short(c.freelancer)}</span>
              </p>
              <div className="progress" aria-label={`${pct}% released`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="small muted" style={{ margin: "8px 0 0" }}>
                Released {c.releasedAmount} / {c.totalAmount} {c.token} &middot;
                In escrow {c.fundedAmount - c.releasedAmount} {c.token}
              </p>
              <ul className="milestones">
                {c.milestones.map((m) => (
                  <li key={m.index}>
                    <span className="truncate">
                      {m.released ? "[x]" : "[ ]"} {m.title}
                    </span>
                    <span className="mono">
                      {m.amount} {c.token}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="row">
                {active && c.fundedAmount < c.totalAmount && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy === c.id}
                    onClick={() =>
                      act(c.id, () =>
                        api(`/api/v1/contracts/${c.id}/deposit`, {
                          method: "POST",
                          body: { amount: c.totalAmount - c.fundedAmount },
                        }),
                      )
                    }
                  >
                    Fund {c.totalAmount - c.fundedAmount} {c.token}
                  </button>
                )}
                {active &&
                  next &&
                  c.fundedAmount - c.releasedAmount >= next.amount && (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busy === c.id}
                      onClick={() =>
                        act(c.id, () =>
                          api(
                            `/api/v1/contracts/${c.id}/milestones/${next.index}/release`,
                            { method: "POST" },
                          ),
                        )
                      }
                    >
                      Release next
                    </button>
                  )}
                {active && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === c.id}
                      onClick={(event) => {
                        disputeTriggerRef.current = event.currentTarget;
                        setDisputeContract(c);
                      }}
                    >
                      Dispute
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={busy === c.id}
                      onClick={async () => {
                        const held = c.fundedAmount - c.releasedAmount;
                        const confirmed = await confirm({
                          title: `Cancel escrow #${c.id}?`,
                          description: `Refund ${held} ${c.token} to the client and close escrow #${c.id}. This cannot be undone.`,
                          tone: "danger",
                          confirmLabel: "Cancel escrow",
                          cancelLabel: "Keep escrow",
                          requireText: held > 0 ? String(c.id) : undefined,
                        });
                        if (confirmed) {
                          act(c.id, () => api(`/api/v1/contracts/${c.id}/cancel`, { method: "POST" }));
                        }
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {c.status === "Disputed" && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy === c.id}
                    onClick={() =>
                      act(c.id, () =>
                        api(`/api/v1/contracts/${c.id}/resolve`, {
                          method: "POST",
                          body: { freelancerBps: 5000 },
                        }),
                      )
                    }
                  >
                    Resolve 50/50
                  </button>
                )}
                {c.status === "Completed" && !c.reputationIssued && (
                  <>
                    <span className="small muted">Rate freelancer:</span>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        className="btn btn-secondary btn-sm"
                        disabled={busy === c.id}
                        onClick={() =>
                          act(c.id, () =>
                            api(`/api/v1/contracts/${c.id}/reputation`, {
                              method: "POST",
                              body: { rating: r },
                            }),
                          )
                        }
                      >
                        {r}
                      </button>
                    ))}
                  </>
                )}
                {c.status === "Completed" && c.reputationIssued && (
                  <span className="small muted">Rated. Thanks!</span>
                )}
              </div>
            </article>
          );
        })}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          onPageChange={goToPage}
        />
      </div>
      {disputeContract && (
        <DisputeDialog
          contract={disputeContract}
          triggerRef={disputeTriggerRef}
          onClose={() => setDisputeContract(null)}
          onSuccess={load}
        />
      )}
    </div>
  );
}