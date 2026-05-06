import { coordKey, orthogonalNeighbors, parseCoordKey, speciesPresentCount } from "./grid";
import type {
  ArboretumState,
  Card,
  FinalScores,
  PathScore,
  PlayerID,
  SpeciesId,
  SpeciesScore
} from "./types";

export function adjustedHandSums(
  state: ArboretumState,
  species: SpeciesId
): Record<PlayerID, number> {
  const ids = Object.keys(state.players);
  const hasOne = Object.fromEntries(
    ids.map((playerID) => [
      playerID,
      state.players[playerID].hand.some((cardID) => {
        const card = state.cardsById[cardID];
        return card?.species === species && card.rank === 1;
      })
    ])
  ) as Record<PlayerID, boolean>;

  return Object.fromEntries(
    ids.map((playerID) => {
      const sum = state.players[playerID].hand.reduce((total, cardID) => {
        const card = state.cardsById[cardID];
        if (!card || card.species !== species) return total;

        const opponentHasOne = ids.some((otherID) => otherID !== playerID && hasOne[otherID]);
        const value = card.rank === 8 && opponentHasOne ? 0 : card.rank;
        return total + value;
      }, 0);

      return [playerID, sum];
    })
  ) as Record<PlayerID, number>;
}

export function scoringRights(state: ArboretumState, species: SpeciesId): PlayerID[] {
  const ids = Object.keys(state.players);
  const nobodyHasSpeciesInHand = ids.every((playerID) =>
    state.players[playerID].hand.every((cardID) => state.cardsById[cardID]?.species !== species)
  );

  if (nobodyHasSpeciesInHand) return ids;

  const sums = adjustedHandSums(state, species);
  const max = Math.max(...Object.values(sums));
  return ids.filter((playerID) => sums[playerID] === max);
}

export function pointsPerCard(score: PathScore): number[] {
  if (score.path.length === 0) return [];
  return score.path.map((_, i) => {
    let value = 1;
    if (score.bonuses.sameSpeciesRun > 0) value += 1;
    if (i === 0) value += score.bonuses.startsWithOne;
    if (i === score.path.length - 1) value += score.bonuses.endsWithEight;
    return value;
  });
}

export function scorePath(cards: Card[], species: SpeciesId): PathScore {
  const sameSpeciesRun =
    cards.length >= 4 && cards.every((card) => card.species === species) ? cards.length : 0;
  const startsWithOne = cards[0]?.rank === 1 ? 1 : 0;
  const endsWithEight = cards.at(-1)?.rank === 8 ? 2 : 0;

  return {
    species,
    score: cards.length + sameSpeciesRun + startsWithOne + endsWithEight,
    path: cards.map((card) => card.id),
    bonuses: {
      sameSpeciesRun,
      startsWithOne,
      endsWithEight
    }
  };
}

export function bestPathForSpecies(
  state: ArboretumState,
  playerID: PlayerID,
  species: SpeciesId
): PathScore {
  const player = state.players[playerID];
  if (!player) {
    return emptyPathScore(species);
  }

  const cardAt = player.arboretum;
  const cardByCoord = new Map<string, Card>();
  const coordByCardID = new Map<string, string>();

  for (const [key, cardID] of Object.entries(cardAt)) {
    const card = state.cardsById[cardID];
    if (card) {
      cardByCoord.set(key, card);
      coordByCardID.set(card.id, key);
    }
  }

  const starts = [...cardByCoord.values()].filter((card) => card.species === species);
  let best = emptyPathScore(species);

  const visit = (path: Card[]) => {
    const current = path.at(-1);
    if (!current) return;

    if (current.species === species && path.length >= 2) {
      best = chooseBetterPath(best, scorePath(path, species));
    }

    const currentCoordKey = coordByCardID.get(current.id);
    if (!currentCoordKey) return;

    for (const neighbor of orthogonalNeighbors(parseCoordKey(currentCoordKey))) {
      const next = cardByCoord.get(coordKey(neighbor));
      if (!next || next.rank <= current.rank) continue;
      visit([...path, next]);
    }
  };

  for (const start of starts) {
    visit([start]);
  }

  return best;
}

export function scoreGame(state: ArboretumState): FinalScores {
  const ids = Object.keys(state.players);
  const speciesScores: SpeciesScore[] = state.speciesInGame.map((species) => {
    const rights = scoringRights(state, species);
    const scores = Object.fromEntries(
      ids.map((playerID) => {
        const path = bestPathForSpecies(state, playerID, species);
        if (rights.includes(playerID)) {
          return [playerID, path];
        }
        return [playerID, { ...path, score: 0 }];
      })
    ) as Record<PlayerID, PathScore>;

    return {
      species,
      scoringRights: rights,
      handSums: adjustedHandSums(state, species),
      scores
    };
  });

  const totals = Object.fromEntries(
    ids.map((playerID) => [
      playerID,
      speciesScores.reduce((total, speciesScore) => total + speciesScore.scores[playerID].score, 0)
    ])
  ) as Record<PlayerID, number>;

  const speciesPresent = Object.fromEntries(
    ids.map((playerID) => [playerID, speciesPresentCount(state, playerID)])
  ) as Record<PlayerID, number>;

  const highestScore = Math.max(...Object.values(totals));
  const scoreTied = ids.filter((playerID) => totals[playerID] === highestScore);
  const highestSpeciesCount = Math.max(...scoreTied.map((playerID) => speciesPresent[playerID]));
  const winners = scoreTied.filter((playerID) => speciesPresent[playerID] === highestSpeciesCount);

  return {
    species: speciesScores,
    totals,
    speciesPresent,
    winners
  };
}

function emptyPathScore(species: SpeciesId): PathScore {
  return {
    species,
    score: 0,
    path: [],
    bonuses: {
      sameSpeciesRun: 0,
      startsWithOne: 0,
      endsWithEight: 0
    }
  };
}

function chooseBetterPath(current: PathScore, candidate: PathScore): PathScore {
  if (candidate.score > current.score) return candidate;
  if (candidate.score < current.score) return current;
  if (candidate.path.length > current.path.length) return candidate;
  return current;
}

