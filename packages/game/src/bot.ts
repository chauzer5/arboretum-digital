import { Bot } from "boardgame.io/ai";
import { coordKey } from "./grid";
import type { ArboretumState, Card, Coord, PlayerID, SpeciesId } from "./types";

export type Difficulty = "easy" | "medium" | "hard";

type BotConstructorOpts = {
  enumerate: (G: ArboretumState, ctx: unknown, playerID: PlayerID) => unknown;
  seed?: string | number;
  difficulty?: Difficulty;
};

// boardgame.io's BotAction is a union of MAKE_MOVE / GAME_EVENT redux actions;
// we treat them opaquely here and just inspect payload.type to score them.
type BotAction = {
  type: string;
  payload: {
    type: string;
    args?: unknown[];
    playerID: string;
  };
};

/**
 * A heuristic bot for Arboretum. Scores every legal move and picks among the
 * best, with difficulty controlling how strictly it picks the optimum.
 *
 * Difficulty levels:
 *  - "easy"   — mostly random, occasionally the best move (very beatable)
 *  - "medium" — picks randomly from the top tier of moves
 *  - "hard"   — always picks the highest-scoring move (random tiebreak)
 */
export class ArboretumBot extends Bot {
  difficulty: Difficulty;

  constructor(opts: BotConstructorOpts) {
    super(opts as unknown as { enumerate: never; seed?: string | number });
    this.difficulty = opts.difficulty ?? "medium";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async play(state: any, playerID: PlayerID): Promise<{ action: any }> {
    const actions = this.enumerate(state.G, state.ctx, playerID) as BotAction[];
    if (actions.length === 0) {
      throw new Error("ArboretumBot.play: no legal actions");
    }

    const scored = actions.map((action) => ({
      action,
      score: scoreAction(state.G as ArboretumState, playerID, action)
    }));
    scored.sort((a, b) => b.score - a.score);

    const chosen = pickByDifficulty(scored, this.difficulty);
    return { action: chosen.action };
  }
}

/**
 * Factory: returns a Bot subclass with the difficulty baked in, suitable for
 * passing to boardgame.io's Local() bots config (which constructs bots with
 * only `{ game, enumerate, seed }`).
 */
export function makeArboretumBot(difficulty: Difficulty): typeof ArboretumBot {
  return class extends ArboretumBot {
    constructor(opts: BotConstructorOpts) {
      super({ ...opts, difficulty });
    }
  };
}

function pickByDifficulty<T extends { score: number }>(
  scored: T[],
  difficulty: Difficulty
): T {
  const bestScore = scored[0].score;

  if (difficulty === "easy") {
    // 70% pure random, 30% optimal: makes basic mistakes consistently
    if (Math.random() < 0.7) {
      return scored[Math.floor(Math.random() * scored.length)];
    }
    return scored[0];
  }

  if (difficulty === "medium") {
    // Pick uniformly from "good" moves (within 1.0 of best)
    const top = scored.filter((s) => s.score >= bestScore - 1.0);
    return top[Math.floor(Math.random() * top.length)];
  }

  // Hard: pick from exact-best ties only
  const exactBest = scored.filter((s) => s.score === bestScore);
  return exactBest[Math.floor(Math.random() * exactBest.length)];
}

function scoreAction(G: ArboretumState, playerID: PlayerID, action: BotAction): number {
  if (action.type === "GAME_EVENT") return 0;
  const moveName = action.payload.type;
  const args = action.payload.args ?? [];

  switch (moveName) {
    case "drawFromDeck":
      return scoreDrawFromDeck(G, playerID);
    case "drawFromDiscard":
      return scoreDrawFromDiscard(G, playerID, args[0] as PlayerID);
    case "plantCard":
      return scorePlant(G, playerID, args[0] as string, args[1] as Coord);
    case "discardCard":
      return scoreDiscard(G, playerID, args[0] as string);
    case "endTurn":
      return 0;
    default:
      return 0;
  }
}

// --- helpers ---

function hasSpeciesPlanted(
  G: ArboretumState,
  playerID: PlayerID,
  species: SpeciesId
): boolean {
  const player = G.players[playerID];
  if (!player) return false;
  for (const id of Object.values(player.arboretum)) {
    if (G.cardsById[id]?.species === species) return true;
  }
  return false;
}

function countSpeciesInArboretum(
  G: ArboretumState,
  playerID: PlayerID,
  species: SpeciesId
): number {
  const player = G.players[playerID];
  if (!player) return 0;
  let n = 0;
  for (const id of Object.values(player.arboretum)) {
    if (G.cardsById[id]?.species === species) n += 1;
  }
  return n;
}

function countSpeciesInHand(
  G: ArboretumState,
  playerID: PlayerID,
  species: SpeciesId
): number {
  const player = G.players[playerID];
  if (!player) return 0;
  return player.hand.filter((id) => G.cardsById[id]?.species === species).length;
}

function getAdjacentCards(
  G: ArboretumState,
  playerID: PlayerID,
  coord: Coord
): Card[] {
  const player = G.players[playerID];
  if (!player) return [];
  const result: Card[] = [];
  const offsets: Coord[] = [
    { x: coord.x + 1, y: coord.y },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x, y: coord.y - 1 }
  ];
  for (const o of offsets) {
    const id = player.arboretum[coordKey(o)];
    if (id) {
      const card = G.cardsById[id];
      if (card) result.push(card);
    }
  }
  return result;
}

function helpsOpponent(G: ArboretumState, myID: PlayerID, card: Card): boolean {
  for (const [otherID] of Object.entries(G.players)) {
    if (otherID === myID) continue;
    if (hasSpeciesPlanted(G, otherID, card.species)) return true;
  }
  return false;
}

// --- per-move heuristics ---

function scoreDrawFromDeck(_G: ArboretumState, _playerID: PlayerID): number {
  // Default safe option: better than zero, worse than a discard pile that gives
  // a high-value card.
  return 2.0;
}

function scoreDrawFromDiscard(
  G: ArboretumState,
  playerID: PlayerID,
  fromPlayerID: PlayerID
): number {
  const source = G.players[fromPlayerID];
  if (!source || source.discard.length === 0) return -Infinity;
  const topID = source.discard[source.discard.length - 1];
  const card = G.cardsById[topID];
  if (!card) return -Infinity;

  let score = 0;
  const planted = hasSpeciesPlanted(G, playerID, card.species);
  const handCount = countSpeciesInHand(G, playerID, card.species);
  const arbCount = countSpeciesInArboretum(G, playerID, card.species);

  // Strong incentive for species I'm building
  if (planted) score += 3;
  // Rank-1 of a planted species is gold (start bonus + cancellation)
  if (planted && card.rank === 1) score += 3;
  // Rank-8 of a planted species (end bonus, but watch for opp 1)
  if (planted && card.rank === 8) score += 2;
  // Mid-high ranks of species I'm building help paths
  if (planted && card.rank >= 5 && card.rank <= 7) score += 1;
  // Already have several of this species in hand → less interesting
  if (handCount >= 3) score -= 1;
  // Species I have nothing of, neither planted nor in hand → low value
  if (!planted && handCount === 0 && arbCount === 0) score -= 2;

  return score;
}

function scorePlant(
  G: ArboretumState,
  playerID: PlayerID,
  cardID: string,
  coord: Coord
): number {
  const card = G.cardsById[cardID];
  if (!card) return -Infinity;
  const player = G.players[playerID];
  if (!player) return -Infinity;

  const isFirst = Object.keys(player.arboretum).length === 0;
  let score = 0;

  if (isFirst) {
    // No adjacency benefit possible. Slight preference for low ranks (path starts).
    if (card.rank <= 3) score += 1;
    return score;
  }

  const adjacent = getAdjacentCards(G, playerID, coord);
  const sameSpecies = adjacent.filter((c) => c.species === card.species);
  const lowerRank = adjacent.filter((c) => c.rank < card.rank);
  const higherRank = adjacent.filter((c) => c.rank > card.rank);

  // Connecting same-species: highest-impact heuristic
  score += sameSpecies.length * 3;
  // Rank fits into ascending paths (any species, any direction)
  score += Math.min(lowerRank.length, 2) * 1.5;
  score += Math.min(higherRank.length, 2) * 1.5;

  // Special positions
  if (card.rank === 1 && hasSpeciesPlanted(G, playerID, card.species)) score += 1;
  if (card.rank === 8 && hasSpeciesPlanted(G, playerID, card.species)) score += 1;

  // Discourage planting that connects to nothing useful (the only legal-but-wasteful play)
  if (sameSpecies.length === 0 && lowerRank.length === 0 && higherRank.length === 0) {
    score -= 1;
  }

  return score;
}

function scoreDiscard(
  G: ArboretumState,
  playerID: PlayerID,
  cardID: string
): number {
  const card = G.cardsById[cardID];
  if (!card) return -Infinity;
  // High score = good to discard (i.e., low value to keep)
  let score = 5;

  const planted = hasSpeciesPlanted(G, playerID, card.species);
  const handCount = countSpeciesInHand(G, playerID, card.species);

  // Rank-1 of a planted species: very protective. Keep!
  if (card.rank === 1 && planted) score -= 5;
  // Rank-8 of a planted species: also valuable
  if (card.rank === 8 && planted) score -= 4;
  // Cards of species I'm building: keep
  if (planted) score -= 2;
  // Plenty of this species in hand → can spare one
  if (handCount >= 3) score += 1;
  // Penalty for handing useful cards to opponents (visible discard piles)
  if (helpsOpponent(G, playerID, card)) score -= 2;

  return score;
}
