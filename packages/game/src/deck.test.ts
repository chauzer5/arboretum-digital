import { describe, expect, test } from "bun:test";
import {
  createDeck,
  defaultSpeciesForPlayerCount,
  playerIDs,
  speciesCountForPlayers
} from "./deck";

describe("speciesCountForPlayers", () => {
  test("returns 6 / 8 / 10 for 2, 3, 4 players", () => {
    expect(speciesCountForPlayers(2)).toBe(6);
    expect(speciesCountForPlayers(3)).toBe(8);
    expect(speciesCountForPlayers(4)).toBe(10);
  });
});

describe("defaultSpeciesForPlayerCount", () => {
  test("returns unique species ids", () => {
    const species = defaultSpeciesForPlayerCount(4);
    expect(species).toHaveLength(10);
    expect(new Set(species).size).toBe(species.length);
  });
});

describe("createDeck", () => {
  test("produces 8 cards (rank 1-8) per species", () => {
    const deck = createDeck(["oak", "maple"]);
    expect(deck).toHaveLength(16);

    const oakRanks = deck.filter((card) => card.species === "oak").map((card) => card.rank);
    expect(oakRanks.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("assigns unique ids", () => {
    const deck = createDeck(["oak", "maple", "willow"]);
    const ids = new Set(deck.map((card) => card.id));
    expect(ids.size).toBe(deck.length);
  });
});

describe("playerIDs", () => {
  test("generates string IDs starting at '0'", () => {
    expect(playerIDs(3)).toEqual(["0", "1", "2"]);
  });
});
