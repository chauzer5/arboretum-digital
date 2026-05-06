import { Bot } from "boardgame.io/ai";
import { coordKey } from "./grid";
import { adjustedHandSums, bestPathForSpecies } from "./scoring";
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

    const G = state.G as ArboretumState;
    const useLookahead = this.difficulty === "hard";

    const scored = actions.map((action) => ({
      action,
      score: useLookahead
        ? scoreActionWithLookahead(G, playerID, action)
        : scoreAction(G, playerID, action)
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

// --- Hard difficulty: 1-ply lookahead -------------------------------------

/**
 * Score a candidate action by simulating its effect and evaluating the
 * resulting position. For moves with hidden outcomes (drawFromDeck), we fall
 * back to a baseline computed from the current position.
 */
function scoreActionWithLookahead(
  G: ArboretumState,
  playerID: PlayerID,
  action: BotAction
): number {
  if (action.type === "GAME_EVENT") return positionValue(G, playerID);
  const moveName = action.payload.type;
  const args = action.payload.args ?? [];

  const simulated = simulateMove(G, playerID, moveName, args);
  if (simulated === null) {
    // drawFromDeck — we can't see the card we'd draw, so estimate the value
    // of "having one more random card" with a small positive baseline.
    if (moveName === "drawFromDeck") return positionValue(G, playerID) + 1.0;
    return scoreAction(G, playerID, action);
  }
  return positionValue(simulated, playerID);
}

function simulateMove(
  G: ArboretumState,
  playerID: PlayerID,
  moveName: string,
  args: unknown[]
): ArboretumState | null {
  const player = G.players[playerID];
  if (!player) return null;

  switch (moveName) {
    case "drawFromDeck":
      return null; // hidden info; caller falls back to baseline
    case "drawFromDiscard": {
      const fromPlayerID = args[0] as PlayerID;
      const source = G.players[fromPlayerID];
      if (!source || source.discard.length === 0) return null;
      const topID = source.discard[source.discard.length - 1];

      if (fromPlayerID === playerID) {
        // Own discard pile → both updates apply to the same player object
        return {
          ...G,
          players: {
            ...G.players,
            [playerID]: {
              ...player,
              hand: [...player.hand, topID],
              discard: player.discard.slice(0, -1)
            }
          }
        };
      }
      return {
        ...G,
        players: {
          ...G.players,
          [fromPlayerID]: {
            ...source,
            discard: source.discard.slice(0, -1)
          },
          [playerID]: {
            ...player,
            hand: [...player.hand, topID]
          }
        }
      };
    }
    case "plantCard": {
      const cardID = args[0] as string;
      const coord = args[1] as Coord;
      const idx = player.hand.indexOf(cardID);
      if (idx === -1) return null;
      const newHand = player.hand.slice();
      newHand.splice(idx, 1);
      return {
        ...G,
        players: {
          ...G.players,
          [playerID]: {
            ...player,
            hand: newHand,
            arboretum: { ...player.arboretum, [coordKey(coord)]: cardID }
          }
        }
      };
    }
    case "discardCard": {
      const cardID = args[0] as string;
      const idx = player.hand.indexOf(cardID);
      if (idx === -1) return null;
      const newHand = player.hand.slice();
      newHand.splice(idx, 1);
      return {
        ...G,
        players: {
          ...G.players,
          [playerID]: {
            ...player,
            hand: newHand,
            discard: [...player.discard, cardID]
          }
        }
      };
    }
    case "endTurn":
      return G;
    default:
      return null;
  }
}

/**
 * Position evaluation: my expected scoring (best path × probability of
 * holding scoring rights) minus a fraction of each opponent's expected
 * scoring. Sums across all species in the game.
 */
function positionValue(G: ArboretumState, playerID: PlayerID): number {
  const ids = Object.keys(G.players);
  let value = 0;

  for (const species of G.speciesInGame) {
    const myPath = bestPathForSpecies(G, playerID, species).score;
    const myProb = scoringRightsProbability(G, playerID, species);
    value += myPath * myProb;

    for (const otherID of ids) {
      if (otherID === playerID) continue;
      const oppPath = bestPathForSpecies(G, otherID, species).score;
      const oppProb = scoringRightsProbability(G, otherID, species);
      // Penalize opponent threats — but less heavily than rewarding our own
      // scoring, so the bot prioritizes building its game over blocking.
      value -= oppPath * oppProb * 0.4;
    }
  }

  return value;
}

/**
 * Heuristic probability that `playerID` will hold scoring rights for
 * `species` given the current hand sums. Treats clear leads as ~certain,
 * ties as shared, and trailing as ~impossible (a coarse approximation that
 * captures the dominant strategic dynamic without modeling future draws).
 */
function scoringRightsProbability(
  G: ArboretumState,
  playerID: PlayerID,
  species: SpeciesId
): number {
  const sums = adjustedHandSums(G, species);
  const ids = Object.keys(G.players);

  const allZero = ids.every((id) => (sums[id] ?? 0) === 0);
  if (allZero) return 1.0; // no one holds the species → everyone scores it

  const mySum = sums[playerID] ?? 0;
  if (mySum === 0) return 0.0;

  const max = Math.max(...ids.map((id) => sums[id] ?? 0));
  if (mySum < max) return 0.0;

  const tied = ids.filter((id) => (sums[id] ?? 0) === max).length;
  return 1.0 / tied;
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
  if (isFirst) {
    // No adjacency, no paths possible. Slight preference for low ranks
    // (rank-1s start great paths and gain the start-bonus).
    let score = 0.5;
    if (card.rank <= 3) score += 0.5;
    return score;
  }

  // Simulate the plant: build a G with this card placed at coord and re-run
  // bestPathForSpecies to see whether the plant actually grows a scoring path.
  const simulatedG: ArboretumState = {
    ...G,
    players: {
      ...G.players,
      [playerID]: {
        ...player,
        arboretum: { ...player.arboretum, [coordKey(coord)]: cardID }
      }
    }
  };

  // Recompute paths only for species that could possibly be affected: the
  // planted card's species (it's a path endpoint candidate) and any adjacent
  // species (the plant could become an interior step in their paths).
  const adjacent = getAdjacentCards(G, playerID, coord);
  const relevantSpecies = new Set<SpeciesId>([card.species]);
  for (const adj of adjacent) {
    relevantSpecies.add(adj.species);
  }

  let pathDelta = 0;
  for (const species of relevantSpecies) {
    const before = bestPathForSpecies(G, playerID, species).score;
    const after = bestPathForSpecies(simulatedG, playerID, species).score;
    const weight = species === card.species ? 4 : 2;
    pathDelta += (after - before) * weight;
  }

  let score = pathDelta;

  // Small bonuses for cards that set up future scoring (start/end bonuses).
  if (card.rank === 1 && hasSpeciesPlanted(G, playerID, card.species)) score += 0.5;
  if (card.rank === 8 && hasSpeciesPlanted(G, playerID, card.species)) score += 0.5;

  // Slight nudge to keep the arboretum compact: connecting at all beats
  // being adjacent to nothing (legal placements that touch only opponents'
  // dead zones).
  if (adjacent.length > 0) score += 0.2;

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
