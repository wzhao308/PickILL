"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { courtStatus, findPlayerLocation } from "@/lib/logic";
import type { AppState, Court, MatchType, Player, PlayerLocation } from "@/lib/types";

const STATUS_LABEL: Record<"open" | "forming" | "busy", string> = {
  open: "Open",
  forming: "Forming",
  busy: "In Play",
};

const PLAYER_KEY = "pickill.player";
const POLL_MS = 4000;
const TICK_MS = 30000;

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "p-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function formatWait(ts: number) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return mins < 1 ? "just joined" : `waiting ${mins} min`;
}

function formatElapsed(ts: number | null) {
  if (!ts) return "starting…";
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return mins < 1 ? "just started" : `${mins} min on court`;
}

export default function Board() {
  const [state, setState] = useState<AppState | null>(null);
  const [persisted, setPersisted] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [selectedCourt, setSelectedCourt] = useState(1);
  const [nameGate, setNameGate] = useState<"closed" | "onboard" | "edit">("closed");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAYER_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.id && parsed?.name) setPlayer(parsed);
      else setNameGate("onboard");
    } catch {
      setNameGate("onboard");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setState(data.state);
      setPersisted(!!data.persisted);
    } catch {
      // transient network hiccup on a background poll — try again next tick
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => forceTick((t) => t + 1), TICK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }

  function savePlayer(p: Player) {
    setPlayer(p);
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
    } catch {
      // localStorage unavailable (private mode, etc.) — name still works for this session
    }
  }

  function submitName(raw: string) {
    const name = raw.trim().slice(0, 24);
    if (!name) return;
    savePlayer({ id: player?.id || makeId(), name });
    setNameGate("closed");
  }

  async function sendAction(action: string, courtId: number, matchType?: MatchType) {
    if (!player) {
      setNameGate("onboard");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, courtId, player, matchType }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "That didn't work — try again.");
        return;
      }
      setState(data.state);
      setPersisted(!!data.persisted);
    } catch {
      showToast("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return <div className="loading-screen">Loading PickILL…</div>;
  }

  const loc = player ? findPlayerLocation(state, player.id) : null;
  const selected = state.courts.find((c) => c.id === selectedCourt) ?? state.courts[0];

  return (
    <>
      {!persisted && (
        <div className="dev-banner">
          No database connected — queue state is only kept in this server's memory and will reset. See the README to add Redis.
        </div>
      )}
      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">🏓</span>
          <span className="brand-name">PickILL</span>
          <span className="brand-sub">UIUC Pickleball Court Queue</span>
        </div>
        {player && (
          <div className="player-chip">
            <span>{player.name}</span>
            <button type="button" onClick={() => setNameGate("edit")}>Change</button>
          </div>
        )}
      </header>

      <main className="wrap">
        {loc && (
          <div className="mystatus">
            <span className="mystatus-text"><MyStatusText loc={loc} /></span>
            <button type="button" className="btn btn--ghost" onClick={() => setSelectedCourt(loc.courtId)}>
              View court
            </button>
          </div>
        )}

        <div className="board">
          <div>
            <div className="legend">
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--status-open)" }} />Open</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--status-forming)" }} />Forming</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--status-busy)" }} />In play</span>
            </div>
            <div className="map">
              {state.courts.map((court) => {
                const status = courtStatus(court);
                const waiting = court.queue.length + (court.match?.status === "forming" ? court.match.players.length : 0);
                return (
                  <button
                    key={court.id}
                    type="button"
                    className={`court-tile status--${status}`}
                    aria-pressed={selectedCourt === court.id}
                    onClick={() => setSelectedCourt(court.id)}
                  >
                    <span className="court-status-bar" aria-hidden="true" />
                    <span className="court-number">Court {court.id}</span>
                    <span className="court-meta">
                      <span className="status-pill">{STATUS_LABEL[status]}</span>
                      <span className="queue-count">{waiting} waiting</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Detail
            court={selected}
            player={player}
            loc={loc}
            busy={busy}
            onJoin={() => sendAction("join", selected.id)}
            onLeave={() => sendAction("leave", selected.id)}
            onChoose={(t) => sendAction("choose-type", selected.id, t)}
            onCancel={() => sendAction("cancel-forming", selected.id)}
            onFinish={() => sendAction("finish", selected.id)}
            onNeedName={() => setNameGate("onboard")}
            onGoTo={(id) => setSelectedCourt(id)}
          />
        </div>

        <p className="footer-note">
          8 courts, laid out 2 rows × 4 columns. Tap a court to see its line, then queue up — first in line picks
          singles or doubles when they&rsquo;re up.
        </p>
      </main>

      {nameGate !== "closed" && (
        <NameGate
          isChange={nameGate === "edit"}
          initial={player?.name ?? ""}
          onSubmit={submitName}
          onCancel={() => setNameGate("closed")}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function MyStatusText({ loc }: { loc: PlayerLocation }) {
  if (loc.role === "match" && loc.match.status === "in-progress") {
    return <>You&rsquo;re playing {loc.match.type === "solo" ? "singles" : "doubles"} on <strong>Court {loc.courtId}</strong>.</>;
  }
  if (loc.role === "match") {
    return <>You&rsquo;re in a forming {loc.match.type === "solo" ? "singles" : "doubles"} match on <strong>Court {loc.courtId}</strong>.</>;
  }
  return <>You&rsquo;re <strong>#{loc.position}</strong> in line for <strong>Court {loc.courtId}</strong>.</>;
}

function Detail({
  court,
  player,
  loc,
  busy,
  onJoin,
  onLeave,
  onChoose,
  onCancel,
  onFinish,
  onNeedName,
  onGoTo,
}: {
  court: Court;
  player: Player | null;
  loc: PlayerLocation | null;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onChoose: (t: MatchType) => void;
  onCancel: () => void;
  onFinish: () => void;
  onNeedName: () => void;
  onGoTo: (courtId: number) => void;
}) {
  const status = courtStatus(court);
  const iAmHere = !!loc && loc.courtId === court.id;
  const iAmFront = !!player && court.queue.length > 0 && court.queue[0].id === player.id;
  const inMatch = !!player && !!court.match && court.match.players.some((p) => p.id === player.id);

  return (
    <div className="detail">
      <div className="detail-head">
        <h2 className="detail-title">Court {court.id}</h2>
        <span className={`status-pill status--${status}`} style={{ padding: ".3rem .7rem" }}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {court.match?.status === "in-progress" && (
        <div className="match-box">
          <p style={{ margin: "0 0 .3rem" }}>
            <strong>{court.match.type === "solo" ? "Singles" : "Doubles"} in progress</strong>
          </p>
          <p style={{ margin: "0 0 .3rem", fontSize: ".88rem" }}>
            {court.match.players.map((p) => p.name + (player && p.id === player.id ? " (you)" : "")).join(", ")}
          </p>
          <p style={{ margin: 0, fontSize: ".78rem", color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace" }}>
            {formatElapsed(court.match.startedAt)}
          </p>
          {inMatch && (
            <div className="btn-row">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={onFinish}>
                Finish match
              </button>
            </div>
          )}
        </div>
      )}

      {court.match?.status === "forming" && (
        <div className="choice-box">
          <p>
            <strong>{court.match.type === "solo" ? "Singles" : "Doubles"} forming</strong> — waiting on{" "}
            {court.match.neededCount - court.match.players.length} more player
            {court.match.neededCount - court.match.players.length === 1 ? "" : "s"}.
          </p>
          <p style={{ margin: 0, fontSize: ".85rem" }}>
            Joined: {court.match.players.map((p) => p.name + (player && p.id === player.id ? " (you)" : "")).join(", ")}
          </p>
          {player && court.match.players[0].id === player.id && (
            <div className="btn-row">
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {!court.match && iAmFront && (
        <div className="choice-box">
          <p><strong>You&rsquo;re up on Court {court.id}!</strong> How are you playing?</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onChoose("solo")}>
              Singles · 1v1
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onChoose("doubles")}>
              Doubles · 2v2
            </button>
          </div>
        </div>
      )}
      {!court.match && !iAmFront && court.queue.length > 0 && (
        <p className="help-note">Waiting on <strong>{court.queue[0].name}</strong> to choose singles or doubles.</p>
      )}

      <p className="eyebrow">Queue</p>
      {court.queue.length === 0 ? (
        <p className="empty-note">No one waiting.</p>
      ) : (
        court.queue.map((p, i) => (
          <div className="queue-row" key={p.id}>
            <span className="queue-pos">{i + 1}</span>
            <span className="queue-name">
              {p.name}
              {player && p.id === player.id && <span className="you-tag">You</span>}
              {i === 0 && !court.match && <span className="you-tag up-next-tag">Up next</span>}
            </span>
            <span className="queue-wait">{formatWait(p.joinedAt)}</span>
          </div>
        ))
      )}

      <div className="btn-row">
        {!player && (
          <button type="button" className="btn btn--primary" onClick={onNeedName}>
            Enter your name to join
          </button>
        )}
        {player && iAmHere && loc?.role === "queue" && (
          <button type="button" className="btn btn--danger" disabled={busy} onClick={onLeave}>
            Leave queue
          </button>
        )}
        {player && iAmHere && loc?.role === "match" && loc.match.status === "forming" && (
          <button type="button" className="btn btn--danger" disabled={busy} onClick={onLeave}>
            Leave
          </button>
        )}
        {player && loc && loc.courtId !== court.id && (
          <span className="help-note">
            You&rsquo;re already in line for Court {loc.courtId}.{" "}
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: ".25rem .6rem", fontSize: ".8rem", marginLeft: ".3rem" }}
              onClick={() => onGoTo(loc.courtId)}
            >
              Go there
            </button>
          </span>
        )}
        {player && !loc && (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={onJoin}>
            Join queue
          </button>
        )}
      </div>
    </div>
  );
}

function NameGate({
  isChange,
  initial,
  onSubmit,
  onCancel,
}: {
  isChange: boolean;
  initial: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="overlay">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <h2>{isChange ? "Change your name" : "Welcome to PickILL"}</h2>
        <p>{isChange ? "Update the name shown on the queue." : "Enter your name to queue for a court."}</p>
        <input
          type="text"
          maxLength={24}
          placeholder="e.g. Sam K."
          autoComplete="off"
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="modal-actions">
          {isChange && (
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn--primary">
            {isChange ? "Save" : "Let's go"}
          </button>
        </div>
      </form>
    </div>
  );
}
