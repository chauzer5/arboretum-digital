import { describe, expect, test } from "bun:test";
import { createDeck } from "./deck";
import { coordKey } from "./grid";
import {
  adjustedHandSums,
  bestPathForSpecies,
  scoreGame,
  scorePath,
  scoringRights
} from "./scoring";
import type { ArboretumState, Card, SpeciesId } from "./types";

describe("scoring rights", () => {
  test("a held 1 cancels an opponent's held 8 for the same species", () => {
    const state = testState([
      { id: "oak-1", species: "oak", rank: 1 },
      { id: "oak-8", species: "oak", rank: 8 }
    ]);

    state.players["0"].hand = ["oak-8"];
    state.players["1"].hand = ["oak-1"];

    expect(adjustedHandSums(state, "oak")).toEqual({
      "0": 0,
      "1": 1
    });
    expect(scoringRights(state, "oak")).toEqual(["1"]);
  });

  test("all players score a species when nobody holds that species in hand", () => {
    const state = testState([{ id: "oak-4", species: "oak", rank: 4 }]);

    expect(scoringRights(state, "oak")).toEqual(["0", "1"]);
  });

  test("a 1 of one species does not cancel an 8 of a different species", () => {
    const state = testState([
      { id: "oak-8", species: "oak", rank: 8 },
      { id: "maple-1", species: "maple", rank: 1 }
    ]);
    state.players["0"].hand = ["oak-8"];
    state.players["1"].hand = ["maple-1"];

    expect(adjustedHandSums(state, "oak")).toEqual({ "0": 8, "1": 0 });
    expect(scoringRights(state, "oak")).toEqual(["0"]);
  });

  test("ties in hand sums grant scoring rights to all tied players", () => {
    const state = testState([
      { id: "oak-5a", species: "oak", rank: 5 },
      { id: "oak-5b", species: "oak", rank: 5 }
    ]);
    state.players["0"].hand = ["oak-5a"];
    state.players["1"].hand = ["oak-5b"];

    expect(scoringRights(state, "oak").sort()).toEqual(["0", "1"]);
  });

  test("only one opponent needs a 1 to cancel an 8 of that species", () => {
    const state = testStateForPlayers(["0", "1", "2"], [
      { id: "oak-8", species: "oak", rank: 8 },
      { id: "oak-1", species: "oak", rank: 1 }
    ]);
    state.players["0"].hand = ["oak-8"];
    state.players["1"].hand = [];
    state.players["2"].hand = ["oak-1"];

    expect(adjustedHandSums(state, "oak")["0"]).toBe(0);
  });
});

describe("scorePath bonus combinations", () => {
  test("stacks start-on-1, end-on-8, and same-species run", () => {
    const cards: Card[] = [
      { id: "oak-1", species: "oak", rank: 1 },
      { id: "oak-3", species: "oak", rank: 3 },
      { id: "oak-5", species: "oak", rank: 5 },
      { id: "oak-8", species: "oak", rank: 8 }
    ];

    const score = scorePath(cards, "oak");

    expect(score.bonuses).toEqual({
      sameSpeciesRun: 4,
      startsWithOne: 1,
      endsWithEight: 2
    });
    expect(score.score).toBe(4 + 4 + 1 + 2);
  });

  test("does not apply same-species bonus to paths shorter than 4", () => {
    const cards: Card[] = [
      { id: "oak-1", species: "oak", rank: 1 },
      { id: "oak-3", species: "oak", rank: 3 },
      { id: "oak-8", species: "oak", rank: 8 }
    ];

    const score = scorePath(cards, "oak");
    expect(score.bonuses.sameSpeciesRun).toBe(0);
  });
});

describe("bestPathForSpecies", () => {
  test("returns score 0 when the player has no cards of that species planted", () => {
    const state = testState([
      { id: "maple-3", species: "maple", rank: 3 }
    ]);
    state.players["0"].arboretum = { [coordKey({ x: 0, y: 0 })]: "maple-3" };
    expect(bestPathForSpecies(state, "0", "oak").score).toBe(0);
  });

  test("a single planted species card does not score (paths require at least 2 cards)", () => {
    const state = testState([{ id: "oak-3", species: "oak", rank: 3 }]);
    state.players["0"].arboretum = { [coordKey({ x: 0, y: 0 })]: "oak-3" };
    const score = bestPathForSpecies(state, "0", "oak");
    expect(score.score).toBe(0);
    expect(score.path).toEqual([]);
  });

  test("picks the higher-scoring of two reachable paths", () => {
    const state = testState([
      { id: "oak-1", species: "oak", rank: 1 },
      { id: "oak-2", species: "oak", rank: 2 },
      { id: "oak-3", species: "oak", rank: 3 },
      { id: "oak-4", species: "oak", rank: 4 }
    ]);
    state.players["0"].arboretum = {
      [coordKey({ x: 0, y: 0 })]: "oak-1",
      [coordKey({ x: 1, y: 0 })]: "oak-2",
      [coordKey({ x: 2, y: 0 })]: "oak-3",
      [coordKey({ x: 3, y: 0 })]: "oak-4"
    };

    const score = bestPathForSpecies(state, "0", "oak");
    expect(score.path).toEqual(["oak-1", "oak-2", "oak-3", "oak-4"]);
    expect(score.score).toBe(4 + 4 + 1);
  });
});

describe("scoreGame", () => {
  test("zeroes out species scores for players without scoring rights", () => {
    const state = testState([
      { id: "oak-8", species: "oak", rank: 8 },
      { id: "oak-3", species: "oak", rank: 3 },
      { id: "oak-5", species: "oak", rank: 5 }
    ]);
    state.players["0"].hand = ["oak-8"];
    state.players["0"].arboretum = {
      [coordKey({ x: 0, y: 0 })]: "oak-3",
      [coordKey({ x: 1, y: 0 })]: "oak-5"
    };
    state.players["1"].arboretum = {};

    const final = scoreGame(state);
    const oakSpecies = final.species.find((s) => s.species === "oak")!;

    expect(oakSpecies.scoringRights).toEqual(["0"]);
    expect(oakSpecies.scores["1"].score).toBe(0);
    expect(oakSpecies.scores["0"].score).toBe(2);
  });

  test("breaks score ties by counting unique species in arboretum", () => {
    const state = testState([
      { id: "oak-3a", species: "oak", rank: 3 },
      { id: "oak-3b", species: "oak", rank: 3 },
      { id: "maple-3a", species: "maple", rank: 3 }
    ]);
    state.players["0"].arboretum = {
      [coordKey({ x: 0, y: 0 })]: "oak-3a",
      [coordKey({ x: 1, y: 0 })]: "maple-3a"
    };
    state.players["1"].arboretum = {
      [coordKey({ x: 0, y: 0 })]: "oak-3b"
    };

    const final = scoreGame(state);

    expect(final.totals["0"]).toBe(final.totals["1"]);
    expect(final.totals["0"]).toBe(0);
    expect(final.winners).toEqual(["0"]);
  });
});

describe("path scoring", () => {
  test("scores a same-species four-card path with start bonus", () => {
    const state = testState([
      { id: "oak-1", species: "oak", rank: 1 },
      { id: "oak-4", species: "oak", rank: 4 },
      { id: "oak-5", species: "oak", rank: 5 },
      { id: "oak-6", species: "oak", rank: 6 }
    ]);

    state.players["0"].arboretum = {
      [coordKey({ x: 0, y: 0 })]: "oak-6",
      [coordKey({ x: 1, y: 0 })]: "oak-5",
      [coordKey({ x: 2, y: 0 })]: "oak-4",
      [coordKey({ x: 3, y: 0 })]: "oak-1"
    };

    const score = bestPathForSpecies(state, "0", "oak");

    expect(score.score).toBe(9);
    expect(score.bonuses.sameSpeciesRun).toBe(4);
    expect(score.bonuses.startsWithOne).toBe(1);
  });

  test("allows nonmatching interior species in a path", () => {
    const state = testState([
      { id: "oak-1", species: "oak", rank: 1 },
      { id: "maple-3", species: "maple", rank: 3 },
      { id: "oak-8", species: "oak", rank: 8 }
    ]);

    state.players["0"].arboretum = {
      [coordKey({ x: 0, y: 0 })]: "oak-1",
      [coordKey({ x: 1, y: 0 })]: "maple-3",
      [coordKey({ x: 2, y: 0 })]: "oak-8"
    };

    const score = bestPathForSpecies(state, "0", "oak");

    expect(score.score).toBe(6);
    expect(score.path).toEqual(["oak-1", "maple-3", "oak-8"]);
  });
});

function testState(extraCards: Card[]): ArboretumState {
  return testStateForPlayers(["0", "1"], extraCards);
}

function testStateForPlayers(playerIDs: string[], extraCards: Card[]): ArboretumState {
  const speciesInGame: SpeciesId[] = ["oak", "maple"];
  const cards = [...createDeck(speciesInGame), ...extraCards];
  const cardsById = Object.fromEntries(cards.map((card) => [card.id, card]));

  return {
    cardsById,
    deck: [],
    speciesInGame,
    players: Object.fromEntries(
      playerIDs.map((id, index) => [
        id,
        {
          name: `Player ${index + 1}`,
          hand: [],
          discard: [],
          arboretum: {}
        }
      ])
    ),
    turn: {
      step: "draw",
      drawsRemaining: 2
    },
    endTriggered: false
  };
}

