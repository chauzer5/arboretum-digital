import { describe, expect, test } from "bun:test";
import { INVALID_MOVE } from "boardgame.io/core";
import { ArboretumGame, enumerateMoves } from "./game";
import { coordKey } from "./grid";
import type { ArboretumState, Coord } from "./types";

type Move = (ctx: MoveContext, ...args: any[]) => unknown;
type MoveContext = {
  G: ArboretumState;
  ctx: { currentPlayer: string; numPlayers: number };
  playerID?: string;
  events: { endTurn: () => void };
};

function getMove(name: keyof typeof ArboretumGame.moves): Move {
  const move = ArboretumGame.moves[name] as { move: Move };
  return move.move;
}

function setupGame(numPlayers: number): ArboretumState {
  const random = {
    Shuffle: <T,>(deck: T[]) => deck
  };
  return ArboretumGame.setup({ ctx: { numPlayers }, random });
}

function makeCtx(
  G: ArboretumState,
  playerID: string,
  numPlayers = 2,
  endTurn: () => void = () => {}
): MoveContext {
  return {
    G,
    ctx: { currentPlayer: playerID, numPlayers },
    playerID,
    events: { endTurn }
  };
}

describe("setup", () => {
  test("uses default species count for the player count", () => {
    const G = setupGame(2);
    expect(G.speciesInGame).toHaveLength(6);

    const G3 = setupGame(3);
    expect(G3.speciesInGame).toHaveLength(8);

    const G4 = setupGame(4);
    expect(G4.speciesInGame).toHaveLength(10);
  });

  test("deals 7 cards to each player", () => {
    const G = setupGame(3);
    expect(Object.keys(G.players)).toEqual(["0", "1", "2"]);
    for (const id of Object.keys(G.players)) {
      expect(G.players[id].hand).toHaveLength(7);
    }
  });

  test("remaining deck size = total cards − 7 × numPlayers", () => {
    const numPlayers = 4;
    const G = setupGame(numPlayers);
    const totalCards = G.speciesInGame.length * 8;
    expect(G.deck.length).toBe(totalCards - 7 * numPlayers);
  });

  test("starts on the draw step with 2 draws remaining", () => {
    const G = setupGame(2);
    expect(G.turn).toEqual({ step: "draw", drawsRemaining: 2 });
    expect(G.endTriggered).toBe(false);
  });
});

describe("drawFromDeck", () => {
  test("rejects when called by a non-current player", () => {
    const G = setupGame(2);
    const drawFromDeck = getMove("drawFromDeck");
    const ctx = makeCtx(G, "1");
    ctx.ctx.currentPlayer = "0";
    expect(drawFromDeck(ctx)).toBe(INVALID_MOVE);
  });

  test("rejects when not in the draw step", () => {
    const G = setupGame(2);
    G.turn.step = "plant";
    const drawFromDeck = getMove("drawFromDeck");
    expect(drawFromDeck(makeCtx(G, "0"))).toBe(INVALID_MOVE);
  });

  test("adds a card to the player's hand and decrements drawsRemaining", () => {
    const G = setupGame(2);
    const initialHandSize = G.players["0"].hand.length;
    const initialDeckSize = G.deck.length;

    const drawFromDeck = getMove("drawFromDeck");
    drawFromDeck(makeCtx(G, "0"));

    expect(G.players["0"].hand).toHaveLength(initialHandSize + 1);
    expect(G.deck.length).toBe(initialDeckSize - 1);
    expect(G.turn.drawsRemaining).toBe(1);
    expect(G.turn.step).toBe("draw");
  });

  test("after the second draw, advances to the plant step", () => {
    const G = setupGame(2);
    const drawFromDeck = getMove("drawFromDeck");
    drawFromDeck(makeCtx(G, "0"));
    drawFromDeck(makeCtx(G, "0"));
    expect(G.turn.step).toBe("plant");
    expect(G.turn.drawsRemaining).toBe(0);
  });

  test("sets endTriggered when the deck is emptied", () => {
    const G = setupGame(2);
    G.deck = [Object.keys(G.cardsById)[0]];
    const drawFromDeck = getMove("drawFromDeck");
    drawFromDeck(makeCtx(G, "0"));
    expect(G.endTriggered).toBe(true);
  });
});

describe("drawFromDiscard", () => {
  test("rejects when target pile is empty", () => {
    const G = setupGame(2);
    const drawFromDiscard = getMove("drawFromDiscard");
    expect(drawFromDiscard(makeCtx(G, "0"), "1")).toBe(INVALID_MOVE);
  });

  test("can draw from your own discard pile", () => {
    const G = setupGame(2);
    G.players["0"].discard = ["oak-3"];
    G.cardsById["oak-3"] = { id: "oak-3", species: "oak", rank: 3 };

    const drawFromDiscard = getMove("drawFromDiscard");
    drawFromDiscard(makeCtx(G, "0"), "0");

    expect(G.players["0"].discard).toHaveLength(0);
    expect(G.players["0"].hand).toContain("oak-3");
  });

  test("does not flip endTriggered when drawing from a discard pile", () => {
    const G = setupGame(2);
    G.players["1"].discard = ["oak-3"];
    G.cardsById["oak-3"] = { id: "oak-3", species: "oak", rank: 3 };

    const drawFromDiscard = getMove("drawFromDiscard");
    drawFromDiscard(makeCtx(G, "0"), "1");
    expect(G.endTriggered).toBe(false);
  });
});

describe("plantCard", () => {
  function setupForPlant(): { G: ArboretumState; cardID: string } {
    const G = setupGame(2);
    G.turn = { step: "plant", drawsRemaining: 0 };
    const cardID = G.players["0"].hand[0];
    return { G, cardID };
  }

  test("rejects a card not in the player's hand", () => {
    const { G } = setupForPlant();
    const plantCard = getMove("plantCard");
    expect(plantCard(makeCtx(G, "0"), "not-a-real-card", { x: 0, y: 0 })).toBe(INVALID_MOVE);
  });

  test("rejects when not in the plant step", () => {
    const { G, cardID } = setupForPlant();
    G.turn.step = "draw";
    const plantCard = getMove("plantCard");
    expect(plantCard(makeCtx(G, "0"), cardID, { x: 0, y: 0 })).toBe(INVALID_MOVE);
  });

  test("rejects an illegal placement (non-adjacent after first)", () => {
    const { G, cardID } = setupForPlant();
    G.players["0"].arboretum = { [coordKey({ x: 0, y: 0 })]: "anchor" };
    G.cardsById["anchor"] = { id: "anchor", species: "oak", rank: 1 };
    const plantCard = getMove("plantCard");
    expect(plantCard(makeCtx(G, "0"), cardID, { x: 5, y: 5 } as Coord)).toBe(INVALID_MOVE);
  });

  test("plants the card and advances to the discard step", () => {
    const { G, cardID } = setupForPlant();
    const plantCard = getMove("plantCard");
    plantCard(makeCtx(G, "0"), cardID, { x: 0, y: 0 });

    expect(G.players["0"].hand).not.toContain(cardID);
    expect(G.players["0"].arboretum[coordKey({ x: 0, y: 0 })]).toBe(cardID);
    expect(G.turn.step).toBe("discard");
  });
});

describe("discardCard", () => {
  test("rejects when not in the discard step", () => {
    const G = setupGame(2);
    const cardID = G.players["0"].hand[0];
    const discardCard = getMove("discardCard");
    expect(discardCard(makeCtx(G, "0"), cardID)).toBe(INVALID_MOVE);
  });

  test("moves to the review step without ending the turn", () => {
    const G = setupGame(2);
    G.turn = { step: "discard", drawsRemaining: 0 };
    const cardID = G.players["0"].hand[0];

    let endedTurn = false;
    const discardCard = getMove("discardCard");
    discardCard(makeCtx(G, "0", 2, () => (endedTurn = true)), cardID);

    expect(G.players["0"].discard).toEqual([cardID]);
    expect(G.turn.step).toBe("review");
    expect(endedTurn).toBe(false);
    expect(G.finalScores).toBeUndefined();
  });
});

describe("endTurn", () => {
  test("rejects when not in the review step", () => {
    const G = setupGame(2);
    G.turn = { step: "plant", drawsRemaining: 0 };
    const endTurn = getMove("endTurn");
    expect(endTurn(makeCtx(G, "0"))).toBe(INVALID_MOVE);
  });

  test("calls events.endTurn during normal play", () => {
    const G = setupGame(2);
    G.turn = { step: "review", drawsRemaining: 0 };
    let endedTurn = false;
    const endTurn = getMove("endTurn");
    endTurn(makeCtx(G, "0", 2, () => (endedTurn = true)));
    expect(endedTurn).toBe(true);
    expect(G.finalScores).toBeUndefined();
  });

  test("computes finalScores when endTriggered is set", () => {
    const G = setupGame(2);
    G.turn = { step: "review", drawsRemaining: 0 };
    G.endTriggered = true;
    let endedTurn = false;
    const endTurn = getMove("endTurn");
    endTurn(makeCtx(G, "0", 2, () => (endedTurn = true)));
    expect(endedTurn).toBe(false);
    expect(G.finalScores).toBeDefined();
    expect(G.finalScores!.species).toHaveLength(G.speciesInGame.length);
  });
});

describe("playerView", () => {
  test("hides opponent hands and the deck contents during play", () => {
    const G = setupGame(2);
    const view = ArboretumGame.playerView({ G, playerID: "0" });
    expect(view.deck).toHaveLength(G.deck.length);
    expect(view.deck.every((id) => id === "hidden-card")).toBe(true);
    expect(view.players["0"].hand).toEqual(G.players["0"].hand);
    expect(view.players["1"].hand.every((id) => id === "hidden-card")).toBe(true);
  });

  test("reveals all hands once finalScores is set", () => {
    const G = setupGame(2);
    G.finalScores = {
      species: [],
      totals: { "0": 0, "1": 0 },
      speciesPresent: { "0": 0, "1": 0 },
      winners: ["0"]
    };
    const view = ArboretumGame.playerView({ G, playerID: "0" });
    expect(view.players["0"].hand).toEqual(G.players["0"].hand);
    expect(view.players["1"].hand).toEqual(G.players["1"].hand);
  });
});

describe("end-to-end turn flow", () => {
  test("draw → draw → plant → discard → endTurn runs without any INVALID_MOVE", () => {
    const G = setupGame(2);
    const drawFromDeck = getMove("drawFromDeck");
    const plantCard = getMove("plantCard");
    const discardCard = getMove("discardCard");
    const endTurn = getMove("endTurn");

    expect(drawFromDeck(makeCtx(G, "0"))).toBeUndefined();
    expect(drawFromDeck(makeCtx(G, "0"))).toBeUndefined();
    expect(G.turn.step).toBe("plant");

    const cardToPlant = G.players["0"].hand[0];
    expect(plantCard(makeCtx(G, "0"), cardToPlant, { x: 0, y: 0 })).toBeUndefined();
    expect(G.turn.step).toBe("discard");

    const cardToDiscard = G.players["0"].hand[0];
    let endedTurn = false;
    expect(
      discardCard(makeCtx(G, "0", 2, () => (endedTurn = true)), cardToDiscard)
    ).toBeUndefined();
    expect(G.turn.step).toBe("review");
    expect(endedTurn).toBe(false);

    expect(endTurn(makeCtx(G, "0", 2, () => (endedTurn = true)))).toBeUndefined();
    expect(endedTurn).toBe(true);
  });
});

describe("enumerateMoves", () => {
  test("returns no moves when it's not your turn", () => {
    const G = setupGame(2);
    expect(enumerateMoves(G, { currentPlayer: "0" }, "1")).toEqual([]);
  });

  test("returns no moves when game is over", () => {
    const G = setupGame(2);
    expect(enumerateMoves(G, { currentPlayer: "0", gameover: { winners: [] } }, "0"))
      .toEqual([]);
  });

  test("draw step: 1 deck move + N discard moves (one per non-empty pile)", () => {
    const G = setupGame(2);
    G.players["1"].discard = ["oak-3"];
    G.cardsById["oak-3"] = { id: "oak-3", species: "oak", rank: 3 };
    const moves = enumerateMoves(G, { currentPlayer: "0" }, "0");
    expect(moves).toContainEqual({ move: "drawFromDeck", args: [] });
    expect(moves).toContainEqual({ move: "drawFromDiscard", args: ["1"] });
    expect(moves).toHaveLength(2);
  });

  test("plant step: cards in hand × legal coords", () => {
    const G = setupGame(2);
    G.turn = { step: "plant", drawsRemaining: 0 };
    const moves = enumerateMoves(G, { currentPlayer: "0" }, "0");
    // 7 unique cards × 1 legal coord (the {0,0} starting square)
    expect(moves).toHaveLength(7);
    expect(moves[0]).toMatchObject({ move: "plantCard" });
  });

  test("discard step: one move per hand card", () => {
    const G = setupGame(2);
    G.turn = { step: "discard", drawsRemaining: 0 };
    const moves = enumerateMoves(G, { currentPlayer: "0" }, "0");
    expect(moves).toHaveLength(7);
    expect(moves.every((m) => m.move === "discardCard")).toBe(true);
  });

  test("review step: just endTurn", () => {
    const G = setupGame(2);
    G.turn = { step: "review", drawsRemaining: 0 };
    const moves = enumerateMoves(G, { currentPlayer: "0" }, "0");
    expect(moves).toEqual([{ move: "endTurn", args: [] }]);
  });
});
