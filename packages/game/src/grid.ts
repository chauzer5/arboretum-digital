import type { ArboretumState, Coord } from "./types";

export function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function parseCoordKey(key: string): Coord {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

export function orthogonalNeighbors(coord: Coord): Coord[] {
  return [
    { x: coord.x + 1, y: coord.y },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x, y: coord.y - 1 }
  ];
}

export function isLegalPlacement(
  arboretum: Record<string, string>,
  coord: Coord
): boolean {
  const key = coordKey(coord);
  if (arboretum[key]) return false;

  const occupiedKeys = Object.keys(arboretum);
  if (occupiedKeys.length === 0) return true;

  return orthogonalNeighbors(coord).some((neighbor) => Boolean(arboretum[coordKey(neighbor)]));
}

export function legalPlacementCoords(arboretum: Record<string, string>): Coord[] {
  const occupiedKeys = Object.keys(arboretum);
  if (occupiedKeys.length === 0) return [{ x: 0, y: 0 }];

  const legal = new Map<string, Coord>();
  for (const key of occupiedKeys) {
    for (const neighbor of orthogonalNeighbors(parseCoordKey(key))) {
      const neighborKey = coordKey(neighbor);
      if (!arboretum[neighborKey]) {
        legal.set(neighborKey, neighbor);
      }
    }
  }

  return [...legal.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function speciesPresentCount(state: ArboretumState, playerID: string): number {
  const player = state.players[playerID];
  if (!player) return 0;

  const present = new Set<string>();
  for (const cardID of Object.values(player.arboretum)) {
    const card = state.cardsById[cardID];
    if (card) {
      present.add(card.species);
    }
  }

  return present.size;
}
