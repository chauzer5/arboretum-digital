import { useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPECIES_BY_ID, type Rank, type SpeciesId } from "@arboretum/game";

type DemoCardProps = {
  species?: SpeciesId;
  rank?: Rank;
  compact?: boolean;
  nameless?: boolean;
  hidden?: boolean;
};

function DemoCard({
  species,
  rank,
  compact = false,
  nameless = false,
  hidden = false
}: DemoCardProps) {
  const cls = ["card"];
  if (compact) cls.push("compact");
  if (nameless) cls.push("nameless");
  if (hidden || !species || rank === undefined) cls.push("hidden");
  if (hidden || !species || rank === undefined) {
    return <span className={cls.join(" ")}>{nameless ? "" : "Hidden"}</span>;
  }
  const speciesData = SPECIES_BY_ID[species];
  return (
    <span className={cls.join(" ")} style={{ "--species-color": speciesData.color } as CSSProperties}>
      <span className="rank">{rank}</span>
      {!nameless ? <span className="species">{speciesData.commonName}</span> : null}
    </span>
  );
}

type PlacedCard = {
  x: number;
  y: number;
  species: SpeciesId;
  rank: Rank;
  legal?: boolean;
};

type DemoArboretumProps = {
  cards: PlacedCard[];
  /** Indices into `cards` in path order. */
  pathIndices?: number[];
  /** Per-card path values, aligned with pathIndices. */
  pathValues?: number[];
};

function DemoArboretum({ cards, pathIndices, pathValues }: DemoArboretumProps) {
  if (cards.length === 0) return null;
  const xs = cards.map((c) => c.x);
  const ys = cards.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cellSize = 44;

  const cardAt = new Map<string, { card: PlacedCard; index: number }>();
  cards.forEach((card, index) => cardAt.set(`${card.x},${card.y}`, { card, index }));

  const stepByIndex = new Map<number, number>();
  if (pathIndices) {
    pathIndices.forEach((idx, step) => stepByIndex.set(idx, step));
  }
  const isHighlighting = stepByIndex.size > 0;

  const cells: ReactNode[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const key = `${x},${y}`;
      const occupied = cardAt.get(key);
      if (occupied) {
        const { card, index } = occupied;
        const step = stepByIndex.get(index);
        const inPath = step !== undefined;
        const dimmed = isHighlighting && !inPath;
        const cls = ["grid-card"];
        if (inPath) cls.push("highlight");
        if (dimmed) cls.push("dimmed");

        let arrowDir: "right" | "left" | "up" | "down" | null = null;
        if (inPath && pathIndices && step !== undefined && step < pathIndices.length - 1) {
          const next = cards[pathIndices[step + 1]];
          if (next.x > card.x) arrowDir = "right";
          else if (next.x < card.x) arrowDir = "left";
          else if (next.y > card.y) arrowDir = "down";
          else if (next.y < card.y) arrowDir = "up";
        }

        const cardValue = inPath && pathValues && step !== undefined ? pathValues[step] : undefined;
        const cardStyle = inPath && step !== undefined ? { zIndex: 100 - step } : undefined;

        cells.push(
          <div key={key} className={cls.join(" ")} style={cardStyle}>
            <DemoCard species={card.species} rank={card.rank} compact nameless />
            {cardValue !== undefined ? (
              <span className="path-step">{cardValue}</span>
            ) : null}
            {arrowDir ? (
              <span className={`path-arrow path-arrow-${arrowDir}`} aria-hidden="true" />
            ) : null}
          </div>
        );
      } else {
        const isLegal = cards.some(
          (c) =>
            c.legal && c.x === x && c.y === y
        );
        cells.push(
          <div
            key={key}
            className={isLegal ? "grid-empty legal" : "grid-empty placeholder"}
          />
        );
      }
    }
  }

  return (
    <div
      className="arboretum-grid compact rules-demo-arboretum"
      style={{ gridTemplateColumns: `repeat(${maxX - minX + 1}, ${cellSize}px)` }}
    >
      {cells}
    </div>
  );
}

function DemoLegalCell() {
  // 3x3 grid: center = the planted card, 4 orthogonal neighbors are legal (green),
  // 4 corners are empty placeholders (no green) to make clear placement is orthogonal-only.
  const cells = [
    "placeholder",
    "legal",
    "placeholder",
    "legal",
    "card",
    "legal",
    "placeholder",
    "legal",
    "placeholder"
  ] as const;
  return (
    <div
      className="arboretum-grid compact rules-demo-arboretum"
      style={{ gridTemplateColumns: "44px 44px 44px" }}
    >
      {cells.map((kind, i) => {
        if (kind === "card") {
          return (
            <div className="grid-card" key={i}>
              <DemoCard species="oak" rank={3} compact nameless />
            </div>
          );
        }
        if (kind === "legal") {
          return <div className="grid-empty legal" key={i} />;
        }
        return <div className="grid-empty placeholder" key={i} />;
      })}
    </div>
  );
}

function DemoPiles() {
  return (
    <div className="rules-demo-piles" aria-hidden="true">
      <div className="pile">
        <span className="pile-label">Deck</span>
        <span className="card compact hidden pile-card">?</span>
        <span className="pile-count">12 left</span>
      </div>
      <div className="pile">
        <span className="pile-label">Player 1</span>
        <div className="pile-card-wrap">
          <div className="pile-card-button">
            <DemoCard species="oak" rank={3} compact nameless />
          </div>
        </div>
        <span className="pile-count">You</span>
      </div>
      <div className="pile">
        <span className="pile-label">Player 2</span>
        <div className="pile-card-wrap">
          <div className="pile-card-button">
            <DemoCard species="maple" rank={5} compact nameless />
          </div>
        </div>
      </div>
      <div className="pile">
        <span className="pile-label">Player 3</span>
        <div className="pile-card-wrap">
          <div className="pile-card-button">
            <DemoCard species="willow" rank={2} compact nameless />
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoHandRow({ cards }: { cards: Array<{ species: SpeciesId; rank: Rank }> }) {
  return (
    <div className="rules-demo-hand">
      {cards.map((c, i) => (
        <DemoCard key={i} species={c.species} rank={c.rank} />
      ))}
    </div>
  );
}

type RulesPage = {
  title: string;
  body: ReactNode;
};

const RULES_PAGES: RulesPage[] = [
  {
    title: "Welcome to Arboretum",
    body: (
      <>
        <p>
          Arboretum is a quiet, strategic card game where you grow a personal grove of trees
          and compete with your opponents for the right to score each species.
        </p>
        <p>
          A typical game lasts 15-30 minutes. The rules are simple, but the choices about
          what to plant, what to hold, and what to discard are surprisingly deep.
        </p>
      </>
    )
  },
  {
    title: "Setup",
    body: (
      <>
        <p>The deck size depends on the player count:</p>
        <ul>
          <li><strong>2 players</strong> — 6 species (48 cards)</li>
          <li><strong>3 players</strong> — 8 species (64 cards)</li>
          <li><strong>4 players</strong> — 10 species (80 cards)</li>
        </ul>
        <p>Every species has 8 cards, ranks 1 through 8. Deal each player 7 cards.</p>
        <div className="rules-demo-row">
          <DemoCard species="oak" rank={1} />
          <DemoCard species="maple" rank={4} />
          <DemoCard species="willow" rank={8} />
        </div>
      </>
    )
  },
  {
    title: "Your turn",
    body: (
      <ol>
        <li><strong>Draw 2 cards</strong>, one at a time, from any source.</li>
        <li><strong>Plant 1 card</strong> from your hand into your arboretum.</li>
        <li><strong>Discard 1 card</strong> from your hand face-up.</li>
        <li><strong>End turn</strong>.</li>
      </ol>
    )
  },
  {
    title: "Drawing",
    body: (
      <>
        <p>Each of your two draws can come from:</p>
        <ul>
          <li>The face-down <strong>deck</strong>, or</li>
          <li>The top of <strong>any</strong> player's discard pile, including your own.</li>
        </ul>
        <DemoPiles />
        <p>
          Discard piles are public — you can always see what's on top before deciding to
          take it.
        </p>
      </>
    )
  },
  {
    title: "Planting",
    body: (
      <>
        <p>
          Your trees go into your <strong>arboretum</strong>, a personal grid in front of
          you. Your first card may be placed anywhere. Every later card must be{" "}
          <strong>orthogonally adjacent</strong> to at least one tree already planted.
        </p>
        <DemoLegalCell />
        <p className="rules-demo-caption">
          Green cells show where your next tree may go.
        </p>
      </>
    )
  },
  {
    title: "End of the game",
    body: (
      <>
        <p>
          When the last card is drawn from the deck, the active player finishes their turn
          (planting and discarding as normal). The game then ends and you score.
        </p>
      </>
    )
  },
  {
    title: "Scoring rights",
    body: (
      <>
        <p>
          Each species is scored independently. To score a species, you must have the{" "}
          <strong>highest total rank</strong> of that species still in your hand at the end
          of the game.
        </p>
        <div className="rules-demo-stack rules-demo-stack--column">
          <div>
            <span className="rules-demo-label">Player A holds</span>
            <DemoHandRow cards={[
              { species: "oak", rank: 5 },
              { species: "oak", rank: 7 }
            ]} />
          </div>
          <div>
            <span className="rules-demo-label">Player B holds</span>
            <DemoHandRow cards={[
              { species: "oak", rank: 3 },
              { species: "oak", rank: 6 }
            ]} />
          </div>
        </div>
        <p className="rules-demo-caption">
          A's Oak total is 12, B's is 9. Player A wins the right to score Oak.
        </p>
        <p>
          Tied totals share scoring rights. If <em>nobody</em> holds the species in hand,
          every player may score it.
        </p>
      </>
    )
  },
  {
    title: "The 1 cancels the 8",
    body: (
      <>
        <p>
          One special rule for scoring rights: if any opponent holds the <strong>1</strong>{" "}
          of a species, your <strong>8</strong> of that same species counts as{" "}
          <strong>0</strong> in the comparison.
        </p>
        <div className="rules-demo-stack">
          <div>
            <span className="rules-demo-label">Player A holds</span>
            <DemoHandRow cards={[{ species: "oak", rank: 8 }]} />
          </div>
          <div>
            <span className="rules-demo-label">Player B holds</span>
            <DemoHandRow cards={[{ species: "oak", rank: 1 }]} />
          </div>
        </div>
        <p className="rules-demo-caption">
          A's 8 is cancelled to 0. B's total is 1. Player B wins the right to score Oak.
        </p>
      </>
    )
  },
  {
    title: "Paths",
    body: (
      <>
        <p>For each species you have the right to score, find your best <strong>path</strong>:</p>
        <ul>
          <li>It must <strong>start and end</strong> on a tree of that species.</li>
          <li>Each step moves to an <strong>orthogonally adjacent</strong> tree.</li>
          <li>Ranks must be <strong>strictly ascending</strong> as you walk the path.</li>
          <li>Interior trees may be any species.</li>
        </ul>
        <DemoArboretum
          cards={[
            { x: 0, y: 0, species: "oak", rank: 1 },
            { x: 1, y: 0, species: "maple", rank: 4 },
            { x: 2, y: 0, species: "oak", rank: 7 }
          ]}
          pathIndices={[0, 1, 2]}
          pathValues={[2, 1, 1]}
        />
        <p className="rules-demo-caption">
          A 3-card Oak path of length 3, with a Maple as an interior step.
        </p>
      </>
    )
  },
  {
    title: "Path scoring",
    body: (
      <>
        <p>Each card in your best path is worth:</p>
        <ul>
          <li><strong>+1</strong> base.</li>
          <li>
            <strong>+1</strong> if every tree in the path is the same species
            (and the path is at least 4 cards long).
          </li>
          <li><strong>+1</strong> on the first card if it's a rank-1 of the species.</li>
          <li><strong>+2</strong> on the last card if it's a rank-8 of the species.</li>
        </ul>
        <DemoArboretum
          cards={[
            { x: 0, y: 0, species: "oak", rank: 1 },
            { x: 1, y: 0, species: "oak", rank: 3 },
            { x: 1, y: 1, species: "oak", rank: 5 },
            { x: 2, y: 1, species: "oak", rank: 8 }
          ]}
          pathIndices={[0, 1, 2, 3]}
          pathValues={[3, 2, 2, 4]}
        />
        <p className="rules-demo-caption">
          A four-card all-Oak path starting on a 1 and ending on an 8 scores 11 points.
          Paths can turn corners as long as each step stays orthogonally adjacent.
        </p>
      </>
    )
  },
  {
    title: "One card, many paths",
    body: (
      <>
        <p>
          A planted card can be part of paths for <strong>multiple species at once</strong>.
          Trees count for whichever paths use them, so a single card can be scored multiple times at the end of the game.
        </p>
        <DemoArboretum
          cards={[
            { x: 0, y: 0, species: "oak", rank: 1 },
            { x: 1, y: 0, species: "maple", rank: 3 },
            { x: 2, y: 0, species: "oak", rank: 5 },
            { x: 3, y: 0, species: "oak", rank: 7 },
            { x: 1, y: 1, species: "maple", rank: 7 }
          ]}
        />
        <p className="rules-demo-caption">
          The Maple 3 here is part of an Oak 1 → Maple 3 → Oak 5 → Oak 7 path
          and also a Maple 3 → Maple 7 path heading down. Plant with multiple
          species in mind.
        </p>
      </>
    )
  },
  {
    title: "Winning",
    body: (
      <>
        <p>
          Add up your path scores across every species you scored. The player with the{" "}
          <strong>highest total wins</strong>.
        </p>
        <p>
          Tiebreaker: the player with the most distinct species planted in their arboretum
          breaks the tie.
        </p>
      </>
    )
  }
];

export function RulesModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const total = RULES_PAGES.length;
  const current = RULES_PAGES[page];
  const isLast = page === total - 1;

  return (
    <motion.div
      className="rules-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="rules-modal-card"
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="rules-modal-close"
          onClick={onClose}
          aria-label="Close rules"
        >
          ×
        </button>
        <p className="rules-modal-step">
          {page + 1} of {total}
        </p>
        <h2 id="rules-modal-title">{current.title}</h2>
        <div className="rules-modal-body">{current.body}</div>
        <div className="rules-modal-nav">
          <button
            type="button"
            className="menu-button ghost"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Back
          </button>
          {isLast ? (
            <button type="button" className="menu-button primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <button
              type="button"
              className="menu-button primary"
              onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
            >
              Next
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function RulesModalRoot({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>{open ? <RulesModal key="rules" onClose={onClose} /> : null}</AnimatePresence>
  );
}
