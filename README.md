# Chess Trainer

Mobile-first chess line trainer for studying PGN repertoires with an interactive board.

## What It Does

- Loads and navigates PGN move trees (including variations).
- Lets you play moves on the board and validates them against current PGN branches.
- Supports branching practice with an `Unlock Add Moves` mode.
- Imports both PGN and FEN from overlays.
- Exports both PGN and FEN.
- Handles pawn promotion with an in-page piece picker overlay.

## Demo

![Board Overview on Phone](media/board-overview-phone.png)
![Board Overview on Browser](media/board-overview-browser.png)
![PGN Navigation](media/pgn-navigation.png)
![Promotion Overlay](media/promotion-overlay.png)


## Getting Started

1. Clone the repo.
2. Open `main.html` in your browser.
3. Click `Import PGN` to load your study line (or use the default one).

No build step or server is required for basic local usage.

## Controls

- `Import PGN`: Open PGN import panel (`Load PGN` or `Close`).
- `Import FEN`: Open FEN import panel (`Load FEN` or `Close`).
- `Previous` / `Next`: Move through the current line.
- Click moves in the PGN panel to jump directly.
- `Unlock Add Moves`: Allow adding new non-PGN moves into the active tree.
- `Export PGN`: Export current PGN tree.
- `Export FEN`: Export current board FEN.
- `Flip Board`: Switch board orientation.

## Keyboard Shortcuts

- `Right Arrow`: Next move
- `Left Arrow`: Previous move
- `Up / Down Arrow`: Switch variation
- `Home`: Go to start position
- `Esc`: Close open overlays

## Project Structure

- `main.html` - UI layout and overlays
- `style.css` - board, panel, and responsive styling
- `logic.js` - PGN parsing, move tree model, navigation, renderer
- `script.js` - UI behavior, board interaction, import/export flow

## Notes

- The app is designed so board interaction stays central on small screens.
- PGN move highlighting scrolls inside the PGN panel only (no forced page scroll jump).
