# Implementation Plan

## Phase 1: Rules First

- Model cards, species, deck setup, player state, hands, discard piles, and personal arboretum grids.
- Implement boardgame.io moves for drawing, planting, and discarding.
- Keep scoring pure and heavily tested.
- Use placeholder assets only.

## Phase 2: Local Prototype

- Build the React table view around boardgame.io local multiplayer.
- Support choosing a seat and playing both sides in one browser.
- Keep interactions click-first before adding drag-and-drop.
- Add Motion layout animations once state transitions are stable.

## Phase 3: Scoring UX

- Show scoring rights by species.
- Highlight each scored path.
- Show path bonuses and tie breakers.
- Add regression tests for tricky scoring scenarios.

## Phase 4: Online Multiplayer

- Switch the client from `Local()` to `SocketIO()`.
- Use the server workspace as the authoritative boardgame.io master.
- Add match IDs, player seats, and a small lobby.
- Add persistence after the gameplay loop is stable.

## Phase 5: Polish

- Add original/approved card art.
- Add animations for draw, plant, discard, and scoring reveals.
- Add keyboard-friendly controls and responsive layout refinements.
- Consider canvas/PixiJS only if the DOM approach becomes too limiting.

