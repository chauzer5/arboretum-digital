import { useState } from "react";
import { RulesModalRoot } from "./RulesModal";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

function HumanIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8v1H4v-1z" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <line x1="12" y1="3" x2="12" y2="8" />
      <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function nextBotName(players: PlayerSetup[], excludeIndex: number): string {
  const used = new Set<string>();
  players.forEach((p, i) => {
    if (i === excludeIndex) return;
    if (p.kind !== "bot") return;
    const match = /^Bot ([A-Z])$/.exec(p.name);
    if (match) used.add(match[1]);
  });
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return `Bot ${letter}`;
  }
  return "Bot";
}

export function MainMenu({ onPassAndPlay }: { onPassAndPlay: () => void }) {
  const [showRules, setShowRules] = useState(false);
  return (
    <main className="menu-shell menu-shell--locked">
      <div className="menu-card">
        <h1>Arboretum</h1>
        <p className="menu-subtitle">A digital tabletop prototype</p>
        <div className="menu-actions">
          <button type="button" className="menu-button primary" onClick={onPassAndPlay}>
            Local Game
          </button>
          <button
            type="button"
            className="menu-button ghost"
            onClick={() => setShowRules(true)}
          >
            Rules
          </button>
        </div>
      </div>
      <RulesModalRoot open={showRules} onClose={() => setShowRules(false)} />
    </main>
  );
}

export type PlayerKind = "human" | "bot";

export type BotDifficulty = "easy" | "medium" | "hard";

export type PlayerSetup = {
  name: string;
  kind: PlayerKind;
  difficulty?: BotDifficulty;
};

const DIFFICULTIES: BotDifficulty[] = ["easy", "medium", "hard"];

export function LocalGameSetup({
  onStart,
  onBack
}: {
  onStart: (players: PlayerSetup[]) => void;
  onBack: () => void;
}) {
  const [players, setPlayers] = useState<PlayerSetup[]>([
    { name: "Player 1", kind: "human" },
    { name: "Player 2", kind: "human" }
  ]);

  const updatePlayer = (index: number, patch: Partial<PlayerSetup>) => {
    setPlayers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const setKind = (index: number, kind: PlayerKind) => {
    setPlayers((prev) => {
      if (prev[index].kind === kind) return prev;
      const next = prev.map((p, i) => (i === index ? { ...p, kind } : p));
      next[index] = {
        ...next[index],
        name: kind === "bot" ? nextBotName(next, index) : `Player ${index + 1}`,
        difficulty: kind === "bot" ? next[index].difficulty ?? "medium" : undefined
      };
      return next;
    });
  };

  const setDifficulty = (index: number, difficulty: BotDifficulty) => {
    setPlayers((prev) =>
      prev.map((p, i) => (i === index ? { ...p, difficulty } : p))
    );
  };

  const removePlayer = (index: number) => {
    if (players.length <= MIN_PLAYERS) return;
    setPlayers((prev) => prev.filter((_, i) => i !== index));
  };

  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS) return;
    setPlayers((prev) => [
      ...prev,
      { name: `Player ${prev.length + 1}`, kind: "human" }
    ]);
  };

  const humanCount = players.filter((p) => p.kind === "human").length;

  const handleStart = () => {
    if (humanCount === 0) return;
    const cleaned = players.map((p, i) => ({
      kind: p.kind,
      name: p.name.trim() || `Player ${i + 1}`
    }));
    onStart(cleaned);
  };

  return (
    <main className="menu-shell">
      <div className="menu-card menu-card--wide">
        <h1>Local Game</h1>
        <p className="menu-subtitle">Set up your players</p>

        <div className="player-list">
          {players.map((player, index) => (
            <div className="player-row" key={index}>
              <span
                className={
                  player.kind === "bot"
                    ? "player-row-tag player-row-tag--bot"
                    : "player-row-tag"
                }
                aria-hidden="true"
              >
                {player.kind === "bot" ? <BotIcon /> : <HumanIcon />}
              </span>
              <input
                type="text"
                className="player-row-input"
                value={player.name}
                onChange={(e) => updatePlayer(index, { name: e.target.value })}
                maxLength={24}
                aria-label={`Player ${index + 1} name`}
              />
              <div
                className="player-kind-toggle"
                role="group"
                aria-label={`Player ${index + 1} kind`}
              >
                <button
                  type="button"
                  className={
                    player.kind === "human"
                      ? "player-kind-button active"
                      : "player-kind-button"
                  }
                  onClick={() => setKind(index, "human")}
                  aria-pressed={player.kind === "human"}
                >
                  Human
                </button>
                <button
                  type="button"
                  className={
                    player.kind === "bot"
                      ? "player-kind-button active"
                      : "player-kind-button"
                  }
                  onClick={() => setKind(index, "bot")}
                  aria-pressed={player.kind === "bot"}
                  disabled={player.kind === "human" && humanCount === 1}
                  title={
                    player.kind === "human" && humanCount === 1
                      ? "At least one player must be human."
                      : undefined
                  }
                >
                  Bot
                </button>
              </div>
              <button
                type="button"
                className="player-row-remove"
                onClick={() => removePlayer(index)}
                disabled={players.length <= MIN_PLAYERS}
                aria-label={`Remove ${player.name || `Player ${index + 1}`}`}
              >
                ×
              </button>
              {player.kind === "bot" ? (
                <div
                  className="player-row-difficulty"
                  role="group"
                  aria-label={`${player.name || `Player ${index + 1}`} difficulty`}
                >
                  <span className="player-row-difficulty-label">Difficulty</span>
                  {DIFFICULTIES.map((level) => {
                    const active = (player.difficulty ?? "medium") === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        className={
                          active
                            ? "player-difficulty-button active"
                            : "player-difficulty-button"
                        }
                        aria-pressed={active}
                        onClick={() => setDifficulty(index, level)}
                      >
                        {level[0].toUpperCase() + level.slice(1)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          className="menu-button ghost menu-button--add"
          onClick={addPlayer}
          disabled={players.length >= MAX_PLAYERS}
        >
          + Add player
        </button>

        <div className="menu-actions">
          <button
            type="button"
            className="menu-button primary"
            onClick={handleStart}
            disabled={humanCount === 0}
          >
            Start game
          </button>
          <button type="button" className="menu-button ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
