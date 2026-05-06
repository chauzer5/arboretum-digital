import { INVALID_MOVE } from "boardgame.io/core";
import { HIDDEN_CARD_ID } from "./constants";
import { createDeck, defaultSpeciesForPlayerCount, playerIDs } from "./deck";
import { coordKey, isLegalPlacement, legalPlacementCoords } from "./grid";
import { scoreGame } from "./scoring";
import type { ArboretumSetupData, ArboretumState, Coord, PlayerID, PlayerState } from "./types";

export type EnumeratedMove =
  | { move: "drawFromDeck"; args: [] }
  | { move: "drawFromDiscard"; args: [PlayerID] }
  | { move: "plantCard"; args: [string, Coord] }
  | { move: "discardCard"; args: [string] }
  | { move: "endTurn"; args: [] };

export function enumerateMoves(
  G: ArboretumState,
  ctx: { currentPlayer: string; gameover?: unknown },
  playerID: PlayerID
): EnumeratedMove[] {
  if (ctx.gameover) return [];
  if (playerID !== ctx.currentPlayer) return [];
  const player = G.players[playerID];
  if (!player) return [];

  const moves: EnumeratedMove[] = [];

  switch (G.turn.step) {
    case "draw": {
      if (G.deck.length > 0) {
        moves.push({ move: "drawFromDeck", args: [] });
      }
      for (const [id, p] of Object.entries(G.players)) {
        if (p.discard.length > 0) {
          moves.push({ move: "drawFromDiscard", args: [id] });
        }
      }
      break;
    }
    case "plant": {
      const coords = legalPlacementCoords(player.arboretum);
      const uniqueCards = Array.from(new Set(player.hand));
      for (const cardID of uniqueCards) {
        for (const coord of coords) {
          moves.push({ move: "plantCard", args: [cardID, coord] });
        }
      }
      break;
    }
    case "discard": {
      const uniqueCards = Array.from(new Set(player.hand));
      for (const cardID of uniqueCards) {
        moves.push({ move: "discardCard", args: [cardID] });
      }
      break;
    }
    case "review": {
      moves.push({ move: "endTurn", args: [] });
      break;
    }
  }

  return moves;
}

type MoveContext = {
  G: ArboretumState;
  ctx: {
    currentPlayer: string;
    numPlayers: number;
  };
  playerID?: string;
  events: {
    endTurn: () => void;
  };
};

type SetupContext = {
  ctx: {
    numPlayers: number;
  };
  random: {
    Shuffle: <T>(deck: T[]) => T[];
  };
};

export const ArboretumGame = {
  name: "arboretum",
  minPlayers: 2,
  maxPlayers: 4,

  ai: {
    enumerate: enumerateMoves
  },

  setup: ({ ctx, random }: SetupContext, setupData?: ArboretumSetupData): ArboretumState => {
    const speciesInGame =
      setupData?.speciesInGame ?? defaultSpeciesForPlayerCount(ctx.numPlayers);
    const cards = createDeck(speciesInGame);
    const deck = random.Shuffle(cards.map((card) => card.id));
    const cardsById = Object.fromEntries(cards.map((card) => [card.id, card]));
    const players = Object.fromEntries(
      playerIDs(ctx.numPlayers).map((playerID) => {
        const hand = deck.splice(0, 7);
        const player: PlayerState = {
          name: setupData?.playerNames?.[Number(playerID)] ?? `Player ${Number(playerID) + 1}`,
          hand,
          discard: [],
          arboretum: {}
        };
        return [playerID, player];
      })
    );

    return {
      cardsById,
      deck,
      speciesInGame,
      players,
      turn: {
        step: "draw",
        drawsRemaining: 2
      },
      endTriggered: false
    };
  },

  playerView: ({ G, playerID }: { G: ArboretumState; playerID?: string | null }) => {
    const gameOver = Boolean(G.finalScores);
    const view: ArboretumState = {
      ...G,
      deck: G.deck.map(() => HIDDEN_CARD_ID),
      players: Object.fromEntries(
        Object.entries(G.players).map(([id, player]) => [
          id,
          {
            ...player,
            hand:
              gameOver || playerID === id
                ? [...player.hand]
                : player.hand.map(() => HIDDEN_CARD_ID)
          }
        ])
      )
    };

    return view;
  },

  turn: {
    onBegin: ({ G }: { G: ArboretumState }) => {
      G.turn = {
        step: "draw",
        drawsRemaining: 2
      };
    }
  },

  moves: {
    drawFromDeck: {
      client: false,
      undoable: false,
      move: (ctx: MoveContext) => {
        if (!isCurrentPlayer(ctx)) return INVALID_MOVE;
        if (ctx.G.turn.step !== "draw" || ctx.G.deck.length === 0) return INVALID_MOVE;

        const cardID = ctx.G.deck.pop();
        if (!cardID) return INVALID_MOVE;

        ctx.G.players[ctx.playerID].hand.push(cardID);
        if (ctx.G.deck.length === 0) {
          ctx.G.endTriggered = true;
        }
        advanceDrawStep(ctx.G);
      }
    },

    drawFromDiscard: {
      undoable: false,
      move: (ctx: MoveContext, fromPlayerID: string) => {
        if (!isCurrentPlayer(ctx)) return INVALID_MOVE;
        if (ctx.G.turn.step !== "draw") return INVALID_MOVE;

        const source = ctx.G.players[fromPlayerID];
        if (!source || source.discard.length === 0) return INVALID_MOVE;

        const cardID = source.discard.pop();
        if (!cardID) return INVALID_MOVE;

        ctx.G.players[ctx.playerID].hand.push(cardID);
        advanceDrawStep(ctx.G);
      }
    },

    plantCard: {
      move: (ctx: MoveContext, cardID: string, coord: Coord) => {
        if (!isCurrentPlayer(ctx)) return INVALID_MOVE;
        if (ctx.G.turn.step !== "plant") return INVALID_MOVE;

        const player = ctx.G.players[ctx.playerID];
        const cardIndex = player.hand.indexOf(cardID);
        if (cardIndex === -1 || !ctx.G.cardsById[cardID]) return INVALID_MOVE;
        if (!isLegalPlacement(player.arboretum, coord)) return INVALID_MOVE;

        player.hand.splice(cardIndex, 1);
        player.arboretum[coordKey(coord)] = cardID;
        ctx.G.turn.step = "discard";
      }
    },

    discardCard: {
      move: (ctx: MoveContext, cardID: string) => {
        if (!isCurrentPlayer(ctx)) return INVALID_MOVE;
        if (ctx.G.turn.step !== "discard") return INVALID_MOVE;

        const player = ctx.G.players[ctx.playerID];
        const cardIndex = player.hand.indexOf(cardID);
        if (cardIndex === -1 || !ctx.G.cardsById[cardID]) return INVALID_MOVE;

        player.hand.splice(cardIndex, 1);
        player.discard.push(cardID);
        ctx.G.turn.step = "review";
      }
    },

    endTurn: {
      client: false,
      undoable: false,
      move: (ctx: MoveContext) => {
        if (!isCurrentPlayer(ctx)) return INVALID_MOVE;
        if (ctx.G.turn.step !== "review") return INVALID_MOVE;

        if (ctx.G.endTriggered) {
          ctx.G.finalScores = scoreGame(ctx.G);
          return;
        }

        ctx.events.endTurn();
      }
    }
  },

  endIf: ({ G }: { G: ArboretumState }) => {
    if (!G.finalScores) return undefined;
    return {
      winners: G.finalScores.winners,
      totals: G.finalScores.totals
    };
  }
};

function isCurrentPlayer(ctx: MoveContext): ctx is MoveContext & { playerID: string } {
  return Boolean(
    ctx.playerID &&
      ctx.playerID === ctx.ctx.currentPlayer &&
      ctx.G.players[ctx.playerID]
  );
}

function advanceDrawStep(G: ArboretumState) {
  G.turn.drawsRemaining -= 1;
  if (G.turn.drawsRemaining <= 0) {
    G.turn.step = "plant";
  }
}
