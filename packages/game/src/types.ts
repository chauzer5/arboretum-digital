export type PlayerID = string;

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type SpeciesId =
  | "blue-spruce"
  | "cassia"
  | "cherry-blossom"
  | "dogwood"
  | "jacaranda"
  | "maple"
  | "oak"
  | "royal-poinciana"
  | "tulip-poplar"
  | "willow";

export type TurnStep = "draw" | "plant" | "discard" | "review";

export type Coord = {
  x: number;
  y: number;
};

export type Card = {
  id: string;
  species: SpeciesId;
  rank: Rank;
};

export type Species = {
  id: SpeciesId;
  commonName: string;
  colorName: string;
  color: string;
};

export type PlayerState = {
  name: string;
  hand: string[];
  discard: string[];
  arboretum: Record<string, string>;
};

export type TurnState = {
  step: TurnStep;
  drawsRemaining: number;
};

export type PathScore = {
  species: SpeciesId;
  score: number;
  path: string[];
  bonuses: {
    sameSpeciesRun: number;
    startsWithOne: number;
    endsWithEight: number;
  };
};

export type SpeciesScore = {
  species: SpeciesId;
  scoringRights: PlayerID[];
  handSums: Record<PlayerID, number>;
  scores: Record<PlayerID, PathScore>;
};

export type FinalScores = {
  species: SpeciesScore[];
  totals: Record<PlayerID, number>;
  speciesPresent: Record<PlayerID, number>;
  winners: PlayerID[];
};

export type ArboretumState = {
  cardsById: Record<string, Card>;
  deck: string[];
  speciesInGame: SpeciesId[];
  players: Record<PlayerID, PlayerState>;
  turn: TurnState;
  endTriggered: boolean;
  finalScores?: FinalScores;
};

export type ArboretumSetupData = {
  speciesInGame?: SpeciesId[];
  playerNames?: string[];
};

