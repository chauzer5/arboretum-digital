import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BoardProps as BgioBoardProps } from "boardgame.io/react";
import { AnimatePresence, motion } from "motion/react";
import {
  HIDDEN_CARD_ID,
  SPECIES_BY_ID,
  bestPathForSpecies,
  coordKey,
  legalPlacementCoords,
  parseCoordKey,
  pointsPerCard,
  type ArboretumState,
  type Card,
  type Coord,
  type FinalScores as FinalScoresState,
  type PlayerID,
  type SpeciesId
} from "@arboretum/game";
import { useSession } from "./SessionContext";

type BoardProps = BgioBoardProps<ArboretumState>;

export function ArboretumBoard({ G, ctx, moves, playerID, isActive, undo }: BoardProps) {
  const session = useSession();
  const { requestHandoff } = session;
  const [selectedCardID, setSelectedCardID] = useState<string | null>(null);
  const [drawnCard, setDrawnCard] = useState<Card | null>(null);

  const prevCurrentPlayer = useRef(ctx.currentPlayer);
  useEffect(() => {
    if (
      ctx.currentPlayer !== prevCurrentPlayer.current &&
      !ctx.gameover &&
      G.players[ctx.currentPlayer]
    ) {
      requestHandoff(ctx.currentPlayer);
    }
    prevCurrentPlayer.current = ctx.currentPlayer;
  }, [ctx.currentPlayer, ctx.gameover, G.players, requestHandoff]);

  // Detect newly-drawn cards in the seat-holder's hand to play a brief reveal.
  // Gated by drawsRemaining decreasing, which catches both of the turn's two
  // draws (the second one has already transitioned step → "plant" by the time
  // the effect runs) while skipping undo and turn-rotation churn.
  const seatHand = playerID ? G.players[playerID]?.hand : undefined;
  const prevHandRef = useRef<string[] | undefined>(seatHand);
  const prevDrawsRef = useRef<number>(G.turn.drawsRemaining);
  useEffect(() => {
    const prev = prevHandRef.current ?? [];
    const curr = seatHand ?? [];
    const drewACard = G.turn.drawsRemaining < prevDrawsRef.current;
    if (drewACard && curr.length > prev.length) {
      const newIDs = curr.filter((id) => !prev.includes(id));
      const lastID = newIDs[newIDs.length - 1];
      const card = lastID ? G.cardsById[lastID] : undefined;
      if (card && card.id !== HIDDEN_CARD_ID) {
        setDrawnCard(card);
      }
    }
    prevHandRef.current = curr;
    prevDrawsRef.current = G.turn.drawsRemaining;
  }, [seatHand, G.cardsById, G.turn.drawsRemaining]);

  useEffect(() => {
    if (!drawnCard) return;
    const t = setTimeout(() => setDrawnCard(null), 1100);
    return () => clearTimeout(t);
  }, [drawnCard]);
  const seat = playerID && G.players[playerID] ? playerID : undefined;
  const seatPlayer = seat ? G.players[seat] : undefined;
  const canAct = Boolean(isActive && seat);
  const playerIDs = Object.keys(G.players);
  const displayName = (id: string): string =>
    session.players[Number(id)]?.name ?? G.players[id]?.name ?? `Player ${Number(id) + 1}`;
  const isBot = (id: string): boolean =>
    session.players[Number(id)]?.kind === "bot";
  const actingName = displayName(ctx.currentPlayer);
  const actingIsBot = !ctx.gameover && isBot(ctx.currentPlayer);
  const canUndo =
    canAct && !ctx.gameover && (G.turn.step === "discard" || G.turn.step === "review");
  const canEndTurn = canAct && !ctx.gameover && G.turn.step === "review";
  const activeArea: "piles" | "hand" | null =
    canAct && !ctx.gameover
      ? G.turn.step === "draw"
        ? "piles"
        : G.turn.step === "plant" || G.turn.step === "discard"
          ? "hand"
          : null
      : null;

  if (!seat || !seatPlayer) {
    return <div className="empty-state">Choose a player seat to view your hand.</div>;
  }

  const selectedCard = selectedCardID ? G.cardsById[selectedCardID] : undefined;
  const opponentIDs = Object.keys(G.players).filter((id) => id !== seat);
  const [highlightSpecies, setHighlightSpecies] = useState<SpeciesId | null>(null);
  const highlightByPlayer = useMemo(
    () => buildHighlightMap(G.finalScores, highlightSpecies),
    [G.finalScores, highlightSpecies]
  );
  const speciesWinners = useMemo(() => {
    if (!G.finalScores || !highlightSpecies) return new Set<string>();
    const row = G.finalScores.species.find((s) => s.species === highlightSpecies);
    if (!row) return new Set<string>();
    const winners = new Set<string>();
    for (const id of row.scoringRights) {
      if ((row.scores[id]?.score ?? 0) > 0) {
        winners.add(id);
      }
    }
    return winners;
  }, [G.finalScores, highlightSpecies]);

  return (
    <div className="board">
      {!ctx.gameover ? (
        <div className="board-toolbar">
          <button
            type="button"
            className="toolbar-button ghost"
            onClick={session.exitToMenu}
          >
            New game
          </button>
        </div>
      ) : null}

      <header className="status-bar">
        <div className="status-info">
          {ctx.gameover ? (
            <button
              type="button"
              className="toolbar-button ghost"
              onClick={session.exitToMenu}
            >
              New game
            </button>
          ) : (
            <>
              <div>
                <span className="eyebrow">Current turn</span>
                <strong>{actingName}</strong>
                {actingIsBot ? <ThinkingDots /> : null}
              </div>
              <div>
                <span className="eyebrow">Step</span>
                <strong>{stepLabel(G.turn.step, G.turn.drawsRemaining)}</strong>
              </div>
            </>
          )}
        </div>

        <div
          className={activeArea === "piles" ? "piles-bar is-active" : "piles-bar"}
          aria-label="Draw piles"
        >
          <button
            className="pile deck-pile"
            type="button"
            disabled={!canAct || G.turn.step !== "draw" || G.deck.length === 0}
            onClick={() => moves.drawFromDeck()}
          >
            <span className="pile-label">Deck</span>
            <span className="card hidden pile-card" aria-hidden="true">?</span>
            <span className="pile-count">{G.deck.length} left</span>
          </button>
          {Object.entries(G.players).map(([id, player]) => (
            <DiscardPile
              key={id}
              G={G}
              player={player}
              playerID={id}
              displayName={displayName(id)}
              canDraw={canAct && G.turn.step === "draw" && player.discard.length > 0}
              onDraw={() => moves.drawFromDiscard(id)}
              isSeat={id === seat}
            />
          ))}
        </div>
      </header>

      {ctx.gameover && G.finalScores ? (
        <FinalScores
          G={G}
          finalScores={G.finalScores}
          highlightSpecies={highlightSpecies}
          onHighlightChange={setHighlightSpecies}
          displayName={displayName}
        />
      ) : null}

      <section className="opponents-row" aria-label={ctx.gameover ? "Players" : "Opponents"}>
        {(ctx.gameover ? playerIDs : opponentIDs).map((id) => (
          <OpponentTable
            key={id}
            G={G}
            playerID={id}
            displayName={displayName(id)}
            isCurrentPlayer={!ctx.gameover && id === ctx.currentPlayer}
            isThinkingBot={id === ctx.currentPlayer && actingIsBot}
            isSpeciesWinner={Boolean(ctx.gameover) && speciesWinners.has(id)}
            highlightPath={highlightByPlayer[id]?.path}
            highlightValues={highlightByPlayer[id]?.values}
            revealHand={Boolean(ctx.gameover)}
          />
        ))}
      </section>

      {!ctx.gameover ? (
        <section className="seat-table">
          <div className="seat-header">
            <h2>Your arboretum</h2>
            {selectedCard ? (
              <span className="hint">
                Planting {selectedCard.rank} {SPECIES_BY_ID[selectedCard.species].commonName} —
                choose a green cell
              </span>
            ) : G.turn.step === "plant" && canAct ? (
              <span className="hint">Pick a card from your hand to plant</span>
            ) : null}
            <PotentialScore G={G} playerID={seat} />
          </div>

          <ArboretumGrid
            G={G}
            arboretum={seatPlayer.arboretum}
            interactive
            canPlant={canAct && G.turn.step === "plant" && Boolean(selectedCardID)}
            onPlant={(coord) => {
              if (!selectedCardID) return;
              moves.plantCard(selectedCardID, coord);
              setSelectedCardID(null);
            }}
            highlightPath={highlightByPlayer[seat]?.path}
            highlightValues={highlightByPlayer[seat]?.values}
          />

          <div className="seat-hand">
            <div className="seat-header">
              <h2>Your hand</h2>
              <span>{seatPlayer.hand.length} cards</span>
            </div>
            <div className={activeArea === "hand" ? "hand is-active" : "hand"}>
              <AnimatePresence mode="popLayout">
                {seatPlayer.hand.map((cardID) => {
                  const card = G.cardsById[cardID];
                  const selected = selectedCardID === cardID;
                  return (
                    <CardButton
                      key={cardID}
                      card={card}
                      selected={selected}
                      onClick={() => {
                        if (!card || !canAct) return;
                        if (G.turn.step === "plant") {
                          setSelectedCardID(selected ? null : cardID);
                        }
                        if (G.turn.step === "discard") {
                          moves.discardCard(cardID);
                        }
                      }}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </section>
      ) : null}

      {canAct && !ctx.gameover ? (
        <div className="action-footer">
          <button
            type="button"
            className="turn-action-button ghost"
            disabled={!canUndo}
            onClick={() => undo()}
          >
            Undo
          </button>
          <button
            type="button"
            className="turn-action-button primary"
            disabled={!canEndTurn}
            onClick={() => moves.endTurn()}
          >
            {G.endTriggered ? "End game" : "End turn"}
          </button>
        </div>
      ) : null}

      <div className="drawn-card-overlay" aria-hidden="true">
        <AnimatePresence>
          {drawnCard ? (
            <motion.div
              key={drawnCard.id}
              className="drawn-card-overlay-card"
              initial={{ opacity: 0, scale: 0.4, rotateY: 90 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              exit={{ opacity: 0, scale: 0.55, y: 220 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
            >
              <CardView card={drawnCard} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function OpponentTable({
  G,
  playerID,
  displayName,
  isCurrentPlayer,
  isThinkingBot,
  isSpeciesWinner,
  highlightPath,
  highlightValues,
  revealHand
}: {
  G: ArboretumState;
  playerID: string;
  displayName: string;
  isCurrentPlayer: boolean;
  isThinkingBot: boolean;
  isSpeciesWinner: boolean;
  highlightPath?: string[];
  highlightValues?: number[];
  revealHand: boolean;
}) {
  const player = G.players[playerID];
  const isEmpty = Object.keys(player.arboretum).length === 0;
  const cls = ["opponent-card"];
  if (isCurrentPlayer) cls.push("acting");
  if (isSpeciesWinner) cls.push("species-winner");

  return (
    <article className={cls.join(" ")}>
      <header>
        <strong>{displayName}</strong>
        {isThinkingBot ? <ThinkingDots /> : (
          <span>{player.hand.length} cards in hand</span>
        )}
      </header>
      {isEmpty ? (
        <div className="empty-arboretum">No trees planted yet</div>
      ) : (
        <ArboretumGrid
          G={G}
          arboretum={player.arboretum}
          interactive={false}
          compact
          highlightPath={highlightPath}
          highlightValues={highlightValues}
        />
      )}
      {revealHand && player.hand.length > 0 ? (
        <div className="opponent-hand" aria-label={`${displayName}'s final hand`}>
          {player.hand.map((cardID) => (
            <div className="opponent-hand-card" key={cardID}>
              <CardView card={G.cardsById[cardID]} compact showName={false} />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ArboretumGrid({
  G,
  arboretum,
  interactive,
  canPlant = false,
  onPlant,
  compact = false,
  highlightPath,
  highlightValues
}: {
  G: ArboretumState;
  arboretum: Record<string, string>;
  interactive: boolean;
  canPlant?: boolean;
  onPlant?: (coord: Coord) => void;
  compact?: boolean;
  highlightPath?: string[];
  highlightValues?: number[];
}) {
  const legalCoords = useMemo(
    () => (interactive ? legalPlacementCoords(arboretum) : []),
    [arboretum, interactive]
  );
  const occupiedCoords = Object.keys(arboretum).map(parseCoordKey);
  const allCoords = interactive ? [...occupiedCoords, ...legalCoords] : occupiedCoords;
  const minX = allCoords.length ? Math.min(...allCoords.map((c) => c.x)) : 0;
  const maxX = allCoords.length ? Math.max(...allCoords.map((c) => c.x)) : 0;
  const minY = allCoords.length ? Math.min(...allCoords.map((c) => c.y)) : 0;
  const maxY = allCoords.length ? Math.max(...allCoords.map((c) => c.y)) : 0;
  const legalKeys = new Set(legalCoords.map(coordKey));
  const cells: Coord[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      cells.push({ x, y });
    }
  }

  const cellSize = compact ? 44 : 64;
  const className = compact ? "arboretum-grid compact" : "arboretum-grid";
  const pathIndex = useMemo(() => {
    const map = new Map<string, number>();
    if (highlightPath) {
      highlightPath.forEach((id, i) => map.set(id, i));
    }
    return map;
  }, [highlightPath]);
  const isHighlighting = pathIndex.size > 0;
  const coordByCardID = useMemo(() => {
    const map = new Map<string, Coord>();
    for (const [key, cardID] of Object.entries(arboretum)) {
      map.set(cardID, parseCoordKey(key));
    }
    return map;
  }, [arboretum]);

  return (
    <div
      className={className}
      style={{
        gridTemplateColumns: `repeat(${maxX - minX + 1}, ${cellSize}px)`
      }}
    >
      {cells.map((coord) => {
        const key = coordKey(coord);
        const cardID = arboretum[key];
        const card = cardID ? G.cardsById[cardID] : undefined;
        const legal = legalKeys.has(key);
        const pathStep = card ? pathIndex.get(card.id) : undefined;
        const inPath = pathStep !== undefined;
        const dimmed = isHighlighting && card && !inPath;

        if (card) {
          const cls = ["grid-card"];
          if (inPath) cls.push("highlight");
          if (dimmed) cls.push("dimmed");

          let arrowDir: "right" | "left" | "down" | "up" | null = null;
          if (
            inPath &&
            highlightPath &&
            pathStep !== undefined &&
            pathStep < highlightPath.length - 1
          ) {
            const nextCardID = highlightPath[pathStep + 1];
            const nextCoord = coordByCardID.get(nextCardID);
            if (nextCoord) {
              if (nextCoord.x > coord.x) arrowDir = "right";
              else if (nextCoord.x < coord.x) arrowDir = "left";
              else if (nextCoord.y > coord.y) arrowDir = "down";
              else if (nextCoord.y < coord.y) arrowDir = "up";
            }
          }

          const cardStyle =
            inPath && pathStep !== undefined
              ? { zIndex: 100 - pathStep }
              : undefined;
          const cardValue =
            inPath && pathStep !== undefined ? highlightValues?.[pathStep] : undefined;

          return (
            <div className={cls.join(" ")} key={key} style={cardStyle}>
              <CardView card={card} compact showName={false} />
              {cardValue !== undefined ? (
                <span className="path-step" aria-label={`Worth ${cardValue}`}>
                  {cardValue}
                </span>
              ) : null}
              {arrowDir ? (
                <span className={`path-arrow path-arrow-${arrowDir}`} aria-hidden="true" />
              ) : null}
            </div>
          );
        }
        if (!interactive) {
          return <div className="grid-empty placeholder" key={key} />;
        }
        return (
          <button
            className={legal ? "grid-empty legal" : "grid-empty"}
            key={key}
            type="button"
            disabled={!canPlant || !legal}
            onClick={() => onPlant?.(coord)}
            aria-label={legal ? `Plant at column ${coord.x}, row ${coord.y}` : "Empty"}
          />
        );
      })}
    </div>
  );
}

function DiscardPile({
  G,
  player,
  playerID,
  displayName,
  canDraw,
  onDraw,
  isSeat
}: {
  G: ArboretumState;
  player: ArboretumState["players"][string];
  playerID: string;
  displayName: string;
  canDraw: boolean;
  onDraw: () => void;
  isSeat: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const top = player.discard.at(-1);
  const topCard = top ? G.cardsById[top] : undefined;
  const restCount = Math.max(player.discard.length - 1, 0);
  const label = displayName;

  useEffect(() => {
    if (!expanded) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [expanded]);

  return (
    <div className="pile discard-pile" ref={containerRef}>
      <span className="pile-label">{label}</span>
      <div className="pile-card-wrap">
        {topCard ? (
          <button
            className="pile-card-button"
            type="button"
            disabled={!canDraw}
            onClick={onDraw}
            aria-label={`Draw ${topCard.rank} ${SPECIES_BY_ID[topCard.species].commonName} from ${displayName}'s discard`}
          >
            <CardView card={topCard} compact showName={false} />
          </button>
        ) : (
          <div className="pile-card-empty">empty</div>
        )}
        {restCount > 0 ? (
          <button
            type="button"
            className={expanded ? "pile-eye open" : "pile-eye"}
            onClick={() => setExpanded((v) => !v)}
            aria-label={
              expanded
                ? `Hide ${displayName}'s discard history`
                : `Show ${displayName}'s discard history (${restCount} more)`
            }
            aria-expanded={expanded}
          >
            <EyeIcon />
            <span className="pile-eye-count">{restCount}</span>
          </button>
        ) : null}
      </div>
      {isSeat ? <span className="pile-count">You</span> : null}
      {expanded && restCount > 0 ? (
        <div className="pile-history" aria-label={`${displayName}'s discard history`}>
          {player.discard
            .slice(0, -1)
            .map((cardID, index) => (
              <div className="pile-history-card" key={`${cardID}-${index}`}>
                <CardView card={G.cardsById[cardID]} compact showName={false} />
              </div>
            ))
            .reverse()}
        </div>
      ) : null}
    </div>
  );
}

function PotentialScore({ G, playerID }: { G: ArboretumState; playerID: PlayerID }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const seatArboretum = G.players[playerID]?.arboretum;
  const data = useMemo(() => {
    if (!seatArboretum) return { total: 0, perSpecies: [] };
    const perSpecies = G.speciesInGame
      .map((species) => {
        const path = bestPathForSpecies(G, playerID, species);
        return { species, score: path.score, length: path.path.length };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    const total = perSpecies.reduce((sum, s) => sum + s.score, 0);
    return { total, perSpecies };
  }, [G, playerID, seatArboretum]);

  return (
    <div className="potential-pill-container" ref={containerRef}>
      <button
        type="button"
        className={open ? "potential-pill open" : "potential-pill"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Your potential score: ${data.total} points. ${open ? "Hide" : "Show"} breakdown.`}
      >
        Potential: <strong>{data.total}</strong> pts
      </button>
      {open ? (
        <div className="potential-breakdown" role="dialog">
          <p className="potential-breakdown-note">
            What you'd score if you won the rights to every species.
          </p>
          {data.perSpecies.length === 0 ? (
            <p className="potential-empty">No scoring paths yet.</p>
          ) : (
            <div className="potential-rows">
              {data.perSpecies.map(({ species, score, length }) => (
                <div className="potential-row" key={species}>
                  <span
                    className="species-swatch"
                    style={{ "--species-color": SPECIES_BY_ID[species].color } as CSSProperties}
                  />
                  <span className="potential-row-name">
                    {SPECIES_BY_ID[species].commonName}
                  </span>
                  <span className="potential-row-meta">
                    {length} card{length === 1 ? "" : "s"}
                  </span>
                  <strong className="potential-row-score">{score}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="thinking" aria-label="thinking">
      <span className="thinking-label">thinking</span>
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </span>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CardButton({
  card,
  selected,
  onClick
}: {
  card?: Card;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 28, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -32, scale: 0.7 }}
      transition={{
        default: { type: "spring", stiffness: 320, damping: 28, mass: 0.6 },
        layout: { type: "spring", stiffness: 700, damping: 38, mass: 0.5 }
      }}
      className={selected ? "card-button selected" : "card-button"}
      type="button"
      onClick={onClick}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
    >
      <CardView card={card} />
    </motion.button>
  );
}

function CardView({
  card,
  compact = false,
  showName = true
}: {
  card?: Card;
  compact?: boolean;
  showName?: boolean;
}) {
  const classes = [
    "card",
    compact ? "compact" : null,
    showName ? null : "nameless"
  ]
    .filter(Boolean)
    .join(" ");

  if (!card || card.id === HIDDEN_CARD_ID) {
    return <span className={`${classes} hidden`}>{showName ? "Hidden" : ""}</span>;
  }

  const species = SPECIES_BY_ID[card.species];

  return (
    <span className={classes} style={{ "--species-color": species.color } as CSSProperties}>
      <span className="rank">{card.rank}</span>
      {showName ? <span className="species">{species.commonName}</span> : null}
    </span>
  );
}

function FinalScores({
  G,
  finalScores,
  highlightSpecies,
  onHighlightChange,
  displayName
}: {
  G: ArboretumState;
  finalScores: FinalScoresState;
  highlightSpecies: SpeciesId | null;
  onHighlightChange: (next: SpeciesId | null) => void;
  displayName: (id: string) => string;
}) {
  const playerIDs = Object.keys(G.players);
  const winnerNames = finalScores.winners.map(displayName).join(", ");

  return (
    <motion.section
      className="final-scores"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <header className="final-scores-header">
        <h2>Final Scores</h2>
        <p>Winner: <strong>{winnerNames}</strong></p>
      </header>

      <div className="score-row">
        {playerIDs.map((id, index) => (
          <motion.div
            key={id}
            className={finalScores.winners.includes(id) ? "score-card winner" : "score-card"}
            initial={{ opacity: 0, y: 14, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: 0.18 + index * 0.12,
              type: "spring",
              stiffness: 220,
              damping: 22
            }}
          >
            <strong>{displayName(id)}</strong>
            <span>{finalScores.totals[id]} pts</span>
            <small>{finalScores.speciesPresent[id]} species planted</small>
          </motion.div>
        ))}
      </div>

      <p className="highlight-hint">Click a species below to trace its scoring path.</p>

      <table className="species-table">
        <thead>
          <tr>
            <th>Species</th>
            <th className="hand-sums-col">Hand sums</th>
            <th>Rights</th>
            {playerIDs.map((id) => (
              <th key={id}>{displayName(id)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {finalScores.species.map((row) => {
            const species = SPECIES_BY_ID[row.species];
            const isHighlighted = highlightSpecies === row.species;
            return (
              <tr
                key={row.species}
                className={isHighlighted ? "species-row highlighted" : "species-row"}
                onClick={() => onHighlightChange(isHighlighted ? null : row.species)}
              >
                <td>
                  <span
                    className="species-swatch"
                    style={{ "--species-color": species.color } as CSSProperties}
                  />
                  {species.commonName}
                </td>
                <td className="numeric hand-sums-col">
                  {playerIDs.map((id) => `${displayName(id)}: ${row.handSums[id]}`).join("  ·  ")}
                </td>
                <td>
                  {row.scoringRights
                    .map((id) => displayName(id))
                    .join(", ") || "—"}
                </td>
                {playerIDs.map((id) => {
                  const score = row.scores[id];
                  const hasRights = row.scoringRights.includes(id);
                  return (
                    <td key={id} className="numeric">
                      {hasRights ? (
                        <span title={describeBonuses(score.bonuses)}>{score.score}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </motion.section>
  );
}

function describeBonuses(bonuses: { sameSpeciesRun: number; startsWithOne: number; endsWithEight: number }) {
  const parts: string[] = [];
  if (bonuses.sameSpeciesRun > 0) parts.push(`+${bonuses.sameSpeciesRun} same-species run`);
  if (bonuses.startsWithOne > 0) parts.push(`+${bonuses.startsWithOne} starts with 1`);
  if (bonuses.endsWithEight > 0) parts.push(`+${bonuses.endsWithEight} ends with 8`);
  return parts.join("  ·  ") || "no bonuses";
}

type HighlightedPath = { path: string[]; values: number[] };

function buildHighlightMap(
  finalScores: FinalScoresState | undefined,
  highlightSpecies: SpeciesId | null
): Record<PlayerID, HighlightedPath> {
  if (!finalScores || highlightSpecies === null) return {};

  const map: Record<PlayerID, HighlightedPath> = {};
  const row = finalScores.species.find((s) => s.species === highlightSpecies);
  if (!row) return map;

  for (const [id, score] of Object.entries(row.scores)) {
    if (score.path.length > 0) {
      map[id] = { path: score.path, values: pointsPerCard(score) };
    }
  }
  return map;
}

function stepLabel(step: ArboretumState["turn"]["step"], drawsRemaining: number) {
  if (step === "draw") return `Draw (${drawsRemaining} left)`;
  if (step === "plant") return "Plant";
  if (step === "discard") return "Discard";
  return "Review";
}
