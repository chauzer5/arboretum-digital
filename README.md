# Arboretum Digital

A Bun workspace monorepo for a web-based implementation of Arboretum-style gameplay.

This repo starts with a local pass-and-play prototype using React and boardgame.io, plus a shared TypeScript rules package that can be used by both the browser client and the multiplayer server.

## Stack

- Bun for package management, scripts, and tests
- TypeScript
- React + Vite for the web client
- boardgame.io for deterministic turn/state management
- Motion for React for UI animations

## Workspace Layout

```text
apps/
  web/       React + Vite client
  server/    boardgame.io server
packages/
  game/      shared game rules, scoring, and boardgame.io config
  assets/    placeholder/original asset home
docs/        implementation notes and roadmap
```

## Getting Started

```bash
bun install
bun test
bun dev
```

Run the multiplayer server separately when needed:

```bash
bun dev:server
```

The current web app uses boardgame.io's local multiplayer mode for fast pass-and-play iteration. The server package is ready for the next step: connecting the web client through boardgame.io's SocketIO multiplayer transport.

## Legal Note

Do not commit publisher-owned card art, logos, or rulebook imagery unless you have permission. The app should use placeholder or original assets during development.

