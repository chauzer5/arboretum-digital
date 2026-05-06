import { createContext, useContext } from "react";

export type PlayerKind = "human" | "bot";

export type BotDifficulty = "easy" | "medium" | "hard";

export type PlayerInfo = {
  name: string;
  kind: PlayerKind;
  difficulty?: BotDifficulty;
};

export type SessionContextValue = {
  seat: string;
  setSeat: (seat: string) => void;
  requestHandoff: (toSeat: string) => void;
  exitToMenu: () => void;
  players: PlayerInfo[];
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession called outside of SessionContext.Provider");
  }
  return ctx;
}
