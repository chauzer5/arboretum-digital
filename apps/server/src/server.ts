import { Server, Origins } from "boardgame.io/server";
import { ArboretumGame } from "@arboretum/game";

const port = Number(Bun.env.PORT ?? 8000);

const server = Server({
  games: [ArboretumGame],
  origins: [Origins.LOCALHOST]
});

server.run(port, () => {
  console.log(`Arboretum game server listening on http://localhost:${port}`);
});

