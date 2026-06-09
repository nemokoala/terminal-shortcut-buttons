# Change Log

## 0.0.8

- Command Deck size (`Full Size` / `Mini Mode`) is managed in global user settings only, not per project.
- Toggling deck size now removes any leftover `terminalButtons.compactDeck` override from workspace settings, including `.vscode/settings.json`.

## 0.0.7

- Changed `Full Size` / `Mini Mode` to save `terminalButtons.compactDeck` in global user settings.
- Clears a workspace `compactDeck` override when toggling deck size so the global preference applies.
- Stopped writing `terminalButtons.compactDeck` when creating workspace settings from `Edit Project`.

## 0.0.6

- Fixed status bar buttons to show both project and user command lists.
- Changed `Edit User` to open the user `settings.json` file directly when possible.

## 0.0.5

- Changed `Edit Project` to open the actual workspace `.vscode/settings.json` file directly.

## 0.0.4

- Shows project and user command lists together.
- Added separate `Edit Project` and `Edit User` buttons.

## 0.0.3

- Added status bar foreground and theme background color options.

## 0.0.2

- Changed `Edit List` to open workspace `settings.json`.
- Automatically creates `terminalButtons.commands` in workspace settings when missing.

## 0.0.1

- Initial release.
- Added configurable terminal shortcut buttons.
- Added responsive Command Deck webview.
- Added mini mode for compact command cards.
- Added optional status bar buttons.
