import { useEffect, useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { Local } from "boardgame.io/multiplayer";
import { AnimatePresence, motion } from "motion/react";
import {
  ArboretumGame,
  makeArboretumBot,
  type ArboretumState
} from "@arboretum/game";
import { ArboretumBoard } from "./ArboretumBoard";
import { LocalGameSetup, MainMenu, type PlayerSetup } from "./MainMenu";
import { SessionContext, type PlayerInfo } from "./SessionContext";

type Phase =
  | { kind: "menu" }
  | { kind: "setup" }
  | { kind: "in-game"; players: PlayerInfo[]; matchID: string };

const SESSION_KEY = "arboretum.session.v4";

type StoredSession = {
  matchID: string;
  players: PlayerInfo[];
  seat: string;
};

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      typeof parsed?.matchID === "string" &&
      Array.isArray(parsed.players) &&
      parsed.players.every(
        (p) =>
          p &&
          typeof p.name === "string" &&
          (p.kind === "human" || p.kind === "bot") &&
          (p.difficulty === undefined ||
            p.difficulty === "easy" ||
            p.difficulty === "medium" ||
            p.difficulty === "hard")
      ) &&
      typeof parsed.seat === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable (private mode, quota); silently skip
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function firstHumanSeat(players: PlayerInfo[]): string {
  const idx = players.findIndex((p) => p.kind === "human");
  return idx === -1 ? "0" : String(idx);
}

export function App() {
  const [phase, setPhase] = useState<Phase>(() => {
    const stored = loadSession();
    if (stored) {
      return {
        kind: "in-game",
        players: stored.players,
        matchID: stored.matchID
      };
    }
    return { kind: "menu" };
  });

  const exitToMenu = () => {
    clearSession();
    setPhase({ kind: "menu" });
  };

  if (phase.kind === "menu") {
    return <MainMenu onPassAndPlay={() => setPhase({ kind: "setup" })} />;
  }

  if (phase.kind === "setup") {
    return (
      <LocalGameSetup
        onStart={(players: PlayerSetup[]) =>
          setPhase({ kind: "in-game", players, matchID: newMatchID() })
        }
        onBack={() => setPhase({ kind: "menu" })}
      />
    );
  }

  return (
    <GameSession
      key={phase.matchID}
      players={phase.players}
      matchID={phase.matchID}
      onExitToMenu={exitToMenu}
    />
  );
}

function GameSession({
  players,
  matchID,
  onExitToMenu
}: {
  players: PlayerInfo[];
  matchID: string;
  onExitToMenu: () => void;
}) {
  const [seat, setSeat] = useState(() => {
    const stored = loadSession();
    if (stored?.matchID === matchID) return stored.seat;
    return firstHumanSeat(players);
  });
  const [handoffTo, setHandoffTo] = useState<string | null>(() => {
    const stored = loadSession();
    if (stored?.matchID === matchID) return null;
    // Show the modal at game start unless the very first seat is a bot
    return players[0]?.kind === "human" ? "0" : null;
  });

  useEffect(() => {
    saveSession({ matchID, players, seat });
  }, [matchID, players, seat]);

  const requestHandoff = (toSeat: string) => {
    const target = players[Number(toSeat)];
    if (!target || target.kind === "bot") {
      // Bots don't need a handoff confirmation; the active human just stays put.
      return;
    }
    setHandoffTo(toSeat);
  };

  const confirmHandoff = () => {
    if (handoffTo === null) return;
    if (handoffTo !== seat) setSeat(handoffTo);
    setHandoffTo(null);
  };

  const ArboretumClient = useMemo(() => {
    const bots: Record<string, ReturnType<typeof makeArboretumBot>> = {};
    players.forEach((p, i) => {
      if (p.kind === "bot") {
        bots[String(i)] = makeArboretumBot(p.difficulty ?? "medium");
      }
    });
    const hasBots = Object.keys(bots).length > 0;
    return Client<ArboretumState>({
      game: ArboretumGame,
      board: ArboretumBoard,
      multiplayer: Local({
        persist: true,
        storageKey: "arboretum.bgio.v1",
        bots: hasBots ? bots : undefined
      }),
      numPlayers: players.length,
      debug: false
    });
    // We deliberately key on the players array so toggling kinds/difficulty rebuilds the client.
  }, [players]);

  return (
    <SessionContext.Provider
      value={{ seat, setSeat, requestHandoff, exitToMenu: onExitToMenu, players }}
    >
      <main className="game-shell">
        <ArboretumClient
          key={`${matchID}-${seat}`}
          matchID={matchID}
          playerID={seat}
        />
      </main>
      <AnimatePresence>
        {handoffTo !== null ? (
          <PassHandoff
            key="pass-handoff"
            toSeat={handoffTo}
            players={players}
            onConfirm={confirmHandoff}
          />
        ) : null}
      </AnimatePresence>
    </SessionContext.Provider>
  );
}

function PassHandoff({
  toSeat,
  players,
  onConfirm
}: {
  toSeat: string;
  players: PlayerInfo[];
  onConfirm: () => void;
}) {
  const label = players[Number(toSeat)]?.name ?? `Player ${Number(toSeat) + 1}`;
  return (
    <motion.div
      className="pass-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pass-modal-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="pass-modal-card"
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <p className="pass-modal-eyebrow">It's your turn</p>
        <h2 id="pass-modal-title">{label}</h2>
        <p>Pass the device, then tap below when you're ready.</p>
        <button type="button" className="menu-button primary" onClick={onConfirm}>
          I'm {label}
        </button>
      </motion.div>
    </motion.div>
  );
}

function newMatchID(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
