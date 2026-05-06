import type { Rank, Species } from "./types";

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly Rank[];

export const SPECIES = [
  {
    id: "blue-spruce",
    commonName: "Blue Spruce",
    colorName: "Blue",
    color: "#2f80c7"
  },
  {
    id: "cassia",
    commonName: "Cassia",
    colorName: "Yellow",
    color: "#e8b51f"
  },
  {
    id: "cherry-blossom",
    commonName: "Cherry Blossom",
    colorName: "Pink",
    color: "#e86aa1"
  },
  {
    id: "dogwood",
    commonName: "Dogwood",
    colorName: "Gray",
    color: "#9ca3a1"
  },
  {
    id: "jacaranda",
    commonName: "Jacaranda",
    colorName: "Purple",
    color: "#684099"
  },
  {
    id: "maple",
    commonName: "Maple",
    colorName: "Orange",
    color: "#dc6a2a"
  },
  {
    id: "oak",
    commonName: "Oak",
    colorName: "Brown",
    color: "#6f4a33"
  },
  {
    id: "royal-poinciana",
    commonName: "Royal Poinciana",
    colorName: "Red",
    color: "#c7363f"
  },
  {
    id: "tulip-poplar",
    commonName: "Tulip Poplar",
    colorName: "Light Green",
    color: "#72b54a"
  },
  {
    id: "willow",
    commonName: "Willow",
    colorName: "Dark Green",
    color: "#23613e"
  }
] as const satisfies readonly Species[];

export const SPECIES_BY_ID = Object.fromEntries(
  SPECIES.map((species) => [species.id, species])
) as Record<(typeof SPECIES)[number]["id"], (typeof SPECIES)[number]>;

export const HIDDEN_CARD_ID = "hidden-card";

