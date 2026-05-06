import { RANKS, SPECIES } from "./constants";
import type { Card, PlayerID, SpeciesId } from "./types";

export function speciesCountForPlayers(numPlayers: number): number {
  if (numPlayers === 2) return 6;
  if (numPlayers === 3) return 8;
  return 10;
}

export function defaultSpeciesForPlayerCount(numPlayers: number): SpeciesId[] {
  return SPECIES.slice(0, speciesCountForPlayers(numPlayers)).map((species) => species.id);
}

export function createDeck(speciesIds: SpeciesId[]): Card[] {
  return speciesIds.flatMap((species) =>
    RANKS.map((rank) => ({
      id: `${species}-${rank}`,
      species,
      rank
    }))
  );
}

export function playerIDs(numPlayers: number): PlayerID[] {
  return Array.from({ length: numPlayers }, (_, index) => String(index));
}

