# Terminal Shortcut Buttons

Run your common terminal commands from configurable buttons in Cursor or VS Code.

![Command Deck preview](media/command-deck-preview.svg)

## Features

- Add shortcut buttons for commands like `npm run dev`, `npm run build`, `git status`, or custom scripts.
- Use a styled `Command Deck` panel with responsive cards.
- Switch between full-size and mini cards.
- Keep optional compact buttons in the bottom status bar.
- Reuse a named terminal or create a fresh terminal per command.
- Configure button labels, commands, descriptions, colors, icons, and ordering from `settings.json`.

## Command Deck

Open the `Terminal Buttons` icon in the Activity Bar to use the Command Deck.

The deck automatically lays buttons out in multiple columns when the panel is wide enough. Use `Mini Mode` to reduce card height and fit more commands on screen.

![Mini mode preview](media/mini-mode-preview.svg)

## Example Configuration

Add this to your workspace `.vscode/settings.json`:

```json
{
  "terminalButtons.showStatusBarButtons": true,
  "terminalButtons.compactDeck": false,
  "terminalButtons.commands": [
    {
      "label": "Dev",
      "icon": "terminal",
      "command": "npm run dev",
      "terminalName": "Dev Server",
      "reuseTerminal": true,
      "description": "Start the local development server."
    },
    {
      "label": "Build",
      "icon": "gear",
      "command": "npm run build",
      "terminalName": "Build",
      "reuseTerminal": false,
      "description": "Run the production build."
    },
    {
      "label": "Git",
      "icon": "source-control",
      "command": "git status",
      "terminalName": "Git",
      "reuseTerminal": true,
      "description": "Show current repository status."
    }
  ]
}
```

Colors are assigned automatically when `backgroundColor` and `color` are omitted. You can override them per button:

```json
{
  "label": "Deploy",
  "command": "npm run deploy",
  "description": "Deploy the current project.",
  "backgroundColor": "#dc2626",
  "color": "#ffffff"
}
```

## Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `terminalButtons.commands` | array | sample commands | Button definitions. |
| `terminalButtons.showStatusBarButtons` | boolean | `true` | Show shortcut buttons in the bottom status bar. |
| `terminalButtons.compactDeck` | boolean | `false` | Use shorter cards in the Command Deck. |

## Button Options

| Option | Type | Description |
| --- | --- | --- |
| `label` | string | Button label. |
| `command` | string | Terminal command to run. |
| `description` | string | Secondary text shown in the Command Deck. |
| `icon` | string | Optional Codicon name for the status bar button. |
| `terminalName` | string | Terminal name. Defaults to the label. |
| `reuseTerminal` | boolean | Reuse the same named terminal when possible. |
| `backgroundColor` | string | Optional CSS color for the Command Deck card. |
| `color` | string | Optional CSS text color for the Command Deck card. |
| `alignment` | string | Status bar alignment: `left` or `right`. |
| `priority` | number | Status bar priority. |

## Commands

- `Terminal Buttons: Refresh Buttons`
- `Terminal Buttons: Edit Command List`
- `Terminal Buttons: Toggle Command Deck Size`
- `Terminal Buttons: Create Workspace Settings`

## Development

Open this folder in Cursor or VS Code and press `F5` to launch an Extension Development Host.

## Package and Publish to Open VSX

```powershell
cd C:\dev\cursor-terminal-buttons
npx ovsx create-namespace nemokoala -p <OPEN_VSX_TOKEN>
npx ovsx publish -p <OPEN_VSX_TOKEN>
```

The published extension ID will be:

```text
nemokoala.terminal-shortcut-buttons
```
