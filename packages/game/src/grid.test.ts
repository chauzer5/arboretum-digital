import { describe, expect, test } from "bun:test";
import { createDeck } from "./deck";
import {
  coordKey,
  isLegalPlacement,
  legalPlacementCoords,
  speciesPresentCount
} from "./grid";
import type { ArboretumState } from "./types";

describe("isLegalPlacement", () => {
  test("any coord is legal in an empty arboretum", () => {
    expect(isLegalPlacement({}, { x: 0, y: 0 })).toBe(true);
    expect(isLegalPlacement({}, { x: 5, y: -3 })).toBe(true);
  });

  test("rejects placement on an already occupied cell", () => {
    const arboretum = { [coordKey({ x: 0, y: 0 })]: "oak-1" };
    expect(isLegalPlacement(arboretum, { x: 0, y: 0 })).toBe(false);
  });

  test("requires orthogonal adjacency to existing card", () => {
    const arboretum = { [coordKey({ x: 0, y: 0 })]: "oak-1" };
    expect(isLegalPlacement(arboretum, { x: 1, y: 0 })).toBe(true);
    expect(isLegalPlacement(arboretum, { x: 0, y: 1 })).toBe(true);
    expect(isLegalPlacement(arboretum, { x: 1, y: 1 })).toBe(false);
    expect(isLegalPlacement(arboretum, { x: 2, y: 0 })).toBe(false);
  });
});

describe("legalPlacementCoords", () => {
  test("returns only (0,0) for an empty arboretum", () => {
    expect(legalPlacementCoords({})).toEqual([{ x: 0, y: 0 }]);
  });

  test("returns the four orthogonal neighbors of a single card", () => {
    const arboretum = { [coordKey({ x: 0, y: 0 })]: "oak-1" };
    const coords = legalPlacementCoords(arboretum);
    expect(coords).toHaveLength(4);
    expect(coords).toEqual(
      expect.arrayContaining([
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
      ])
    );
  });

  test("dedupes neighbors shared between two adjacent cards", () => {
    const arboretum = {
      [coordKey({ x: 0, y: 0 })]: "oak-1",
      [coordKey({ x: 1, y: 0 })]: "oak-2"
    };
    const coords = legalPlacementCoords(arboretum);
    const keys = coords.map(coordKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(coordKey({ x: 0, y: 0 }));
    expect(keys).not.toContain(coordKey({ x: 1, y: 0 }));
  });
});

describe("speciesPresentCount", () => {
  test("counts unique species in a player's arboretum", () => {
    const cards = createDeck(["oak", "maple", "willow"]);
    const cardsById = Object.fromEntries(cards.map((card) => [card.id, card]));
    const state: ArboretumState = {
      cardsById,
      deck: [],
      speciesInGame: ["oak", "maple", "willow"],
      players: {
        "0": {
          name: "P1",
          hand: [],
          discard: [],
          arboretum: {
            [coordKey({ x: 0, y: 0 })]: "oak-1",
            [coordKey({ x: 1, y: 0 })]: "oak-2",
            [coordKey({ x: 2, y: 0 })]: "maple-3"
          }
        }
      },
      turn: { step: "draw", drawsRemaining: 2 },
      endTriggered: false,
      log: []
    };

    expect(speciesPresentCount(state, "0")).toBe(2);
  });

  test("returns 0 for an unknown player", () => {
    const state: ArboretumState = {
      cardsById: {},
      deck: [],
      speciesInGame: [],
      players: {},
      turn: { step: "draw", drawsRemaining: 2 },
      endTriggered: false,
      log: []
    };
    expect(speciesPresentCount(state, "0")).toBe(0);
  });
});
