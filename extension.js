const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");

const EXTENSION_COMMAND_PREFIX = "cursorTerminalButtons.run";
const WEBVIEW_VIEW_ID = "cursorTerminalButtons.deck";
const DEFAULT_BUTTON_PALETTE = [
  { backgroundColor: "#2563eb", color: "#ffffff" },
  { backgroundColor: "#0f766e", color: "#ffffff" },
  { backgroundColor: "#7c3aed", color: "#ffffff" },
  { backgroundColor: "#b45309", color: "#ffffff" },
  { backgroundColor: "#be123c", color: "#ffffff" },
  { backgroundColor: "#4f46e5", color: "#ffffff" },
  { backgroundColor: "#15803d", color: "#ffffff" },
  { backgroundColor: "#52525b", color: "#ffffff" }
];
const DEFAULT_COMMANDS = [
  {
    label: "Dev",
    icon: "terminal",
    command: "npm run dev",
    terminalName: "Dev Server",
    reuseTerminal: true,
    description: "Start the local development server."
  },
  {
    label: "Build",
    icon: "gear",
    command: "npm run build",
    terminalName: "Build",
    reuseTerminal: false,
    description: "Run the production build."
  },
  {
    label: "Git",
    icon: "source-control",
    command: "git status",
    terminalName: "Git",
    reuseTerminal: true,
    description: "Show current repository status."
  }
];

/** @type {vscode.StatusBarItem[]} */
let statusBarItems = [];

/** @type {vscode.Disposable[]} */
let commandDisposables = [];

/** @type {Map<string, vscode.Terminal>} */
const terminalsByName = new Map();

/** @type {CommandDeckProvider | undefined} */
let commandDeckProvider;

function activate(context) {
  commandDeckProvider = new CommandDeckProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WEBVIEW_VIEW_ID, commandDeckProvider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorTerminalButtons.refresh", () => {
      rebuildButtons(context);
      commandDeckProvider.refresh();
      vscode.window.showInformationMessage("Terminal buttons refreshed.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorTerminalButtons.openSettings", async () => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.commands.executeCommand("workbench.action.openSettings", "terminalButtons.commands");
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      const settingsUri = vscode.Uri.joinPath(workspaceFolder.uri, ".vscode", "settings.json");
      const config = vscode.workspace.getConfiguration("terminalButtons", workspaceFolder.uri);
      const inspectedCommands = config.inspect("commands");

      if (
        typeof inspectedCommands?.workspaceFolderValue === "undefined" &&
        typeof inspectedCommands?.workspaceValue === "undefined"
      ) {
        await ensureWorkspaceSettingsCommands(settingsUri);
      }

      const document = await vscode.workspace.openTextDocument(settingsUri);
      await vscode.window.showTextDocument(document);
      rebuildButtons(context);
      commandDeckProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorTerminalButtons.openUserSettings", async () => {
      const config = vscode.workspace.getConfiguration("terminalButtons");
      const inspectedCommands = config.inspect("commands");

      if (typeof inspectedCommands?.globalValue === "undefined") {
        await config.update("commands", DEFAULT_COMMANDS, vscode.ConfigurationTarget.Global);
      }

      try {
        const document = await vscode.workspace.openTextDocument(getUserSettingsUri());
        await vscode.window.showTextDocument(document);
      } catch {
        await vscode.commands.executeCommand("workbench.action.openSettingsJson");
      }

      rebuildButtons(context);
      commandDeckProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorTerminalButtons.createWorkspaceSettings", async () => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showWarningMessage("Open a workspace folder before creating Terminal Buttons settings.");
        return;
      }

      const config = vscode.workspace.getConfiguration("terminalButtons");
      await config.update("showStatusBarButtons", true, vscode.ConfigurationTarget.Workspace);
      await config.update("commands", DEFAULT_COMMANDS, vscode.ConfigurationTarget.Workspace);
      rebuildButtons(context);
      commandDeckProvider.refresh();
      vscode.window.showInformationMessage("Terminal Buttons settings were added to this workspace.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorTerminalButtons.toggleCompactDeck", async () => {
      const config = vscode.workspace.getConfiguration("terminalButtons");
      const compactDeck = config.get("compactDeck", false);
      const inspected = config.inspect("compactDeck");

      await config.update("compactDeck", !compactDeck, vscode.ConfigurationTarget.Global);

      if (inspected?.workspaceValue !== undefined) {
        await config.update("compactDeck", undefined, vscode.ConfigurationTarget.Workspace);
      }

      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const folderConfig = vscode.workspace.getConfiguration("terminalButtons", folder.uri);

        if (folderConfig.inspect("compactDeck")?.workspaceFolderValue !== undefined) {
          await folderConfig.update("compactDeck", undefined, vscode.ConfigurationTarget.WorkspaceFolder);
        }
      }

      commandDeckProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("terminalButtons.commands") ||
        event.affectsConfiguration("terminalButtons.showStatusBarButtons") ||
        event.affectsConfiguration("terminalButtons.compactDeck")
      ) {
        rebuildButtons(context);
        commandDeckProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      for (const [name, trackedTerminal] of terminalsByName.entries()) {
        if (trackedTerminal === terminal) {
          terminalsByName.delete(name);
        }
      }
    })
  );

  rebuildButtons(context);
}

function deactivate() {
  disposeButtons();
  disposeCommands();
  terminalsByName.clear();
}

function rebuildButtons(context) {
  disposeButtons();

  const showStatusBarButtons = vscode.workspace
    .getConfiguration("terminalButtons")
    .get("showStatusBarButtons", true);

  if (!showStatusBarButtons) {
    return;
  }

  const commands = getConfiguredCommands();

  commands.forEach((buttonConfig, index) => {
    if (!isValidButtonConfig(buttonConfig)) {
      return;
    }

    const commandId = `${EXTENSION_COMMAND_PREFIX}.${index}`;
    const disposableCommand = vscode.commands.registerCommand(commandId, () => {
      runTerminalCommand(buttonConfig);
    });
    commandDisposables.push(disposableCommand);

    const item = vscode.window.createStatusBarItem(
      getAlignment(buttonConfig.alignment),
      typeof buttonConfig.priority === "number" ? buttonConfig.priority : 100 - index
    );

    item.text = formatButtonText(buttonConfig);
    item.tooltip = buttonConfig.command;
    item.command = commandId;
    applyStatusBarColors(item, buttonConfig);
    item.show();

    statusBarItems.push(item);
    context.subscriptions.push(item);
  });
}

function disposeButtons() {
  statusBarItems.forEach((item) => item.dispose());
  statusBarItems = [];
  disposeCommands();
}

function disposeCommands() {
  commandDisposables.forEach((command) => command.dispose());
  commandDisposables = [];
}

function isValidButtonConfig(config) {
  return (
    config &&
    typeof config.label === "string" &&
    config.label.trim().length > 0 &&
    typeof config.command === "string" &&
    config.command.trim().length > 0
  );
}

function getAlignment(alignment) {
  return alignment === "right"
    ? vscode.StatusBarAlignment.Right
    : vscode.StatusBarAlignment.Left;
}

function formatButtonText(config) {
  const label = config.label.trim();
  return config.icon ? `$(${config.icon}) ${label}` : label;
}

function applyStatusBarColors(item, config) {
  const foregroundColor = getStatusBarForegroundColor(config);
  const backgroundColor = getStatusBarBackgroundColor(config.statusBarBackgroundColor);

  if (foregroundColor) {
    item.color = foregroundColor;
  }

  if (backgroundColor) {
    item.backgroundColor = backgroundColor;
  }
}

function getStatusBarForegroundColor(config) {
  if (typeof config.statusBarColor === "string" && config.statusBarColor.trim()) {
    return toThemeOrCssColor(config.statusBarColor);
  }

  if (typeof config.color === "string" && config.color.trim()) {
    return toThemeOrCssColor(config.color);
  }

  return undefined;
}

function toThemeOrCssColor(value) {
  const trimmedValue = value.trim();

  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmedValue) || /^[a-zA-Z]+$/.test(trimmedValue)) {
    return trimmedValue;
  }

  if (/^[a-zA-Z][\w.-]*$/.test(trimmedValue)) {
    return new vscode.ThemeColor(trimmedValue);
  }

  return undefined;
}

function getStatusBarBackgroundColor(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue || normalizedValue === "none") {
    return undefined;
  }

  const knownBackgrounds = {
    prominent: "statusBarItem.prominentBackground",
    warning: "statusBarItem.warningBackground",
    error: "statusBarItem.errorBackground"
  };

  const themeColorId = knownBackgrounds[normalizedValue] || normalizedValue;

  if (
    themeColorId === "statusBarItem.prominentBackground" ||
    themeColorId === "statusBarItem.warningBackground" ||
    themeColorId === "statusBarItem.errorBackground"
  ) {
    return new vscode.ThemeColor(themeColorId);
  }

  return undefined;
}

function runTerminalCommand(config) {
  const terminalName = config.terminalName || config.label;
  const reuseTerminal = config.reuseTerminal !== false;
  const terminal = reuseTerminal
    ? getOrCreateTerminal(terminalName)
    : vscode.window.createTerminal(terminalName);

  terminal.show();
  terminal.sendText(config.command);
}

function getOrCreateTerminal(name) {
  const existingTerminal = terminalsByName.get(name);

  if (existingTerminal) {
    return existingTerminal;
  }

  const terminal = vscode.window.createTerminal(name);
  terminalsByName.set(name, terminal);
  return terminal;
}

function getConfiguredCommands() {
  return getConfiguredCommandSections().flatMap((section) => section.commands);
}

function getConfiguredCommandSections() {
  const inspectedCommands = vscode.workspace
    .getConfiguration("terminalButtons")
    .inspect("commands");

  const workspaceCommands = getValidCommands(inspectedCommands?.workspaceFolderValue)
    .concat(getValidCommands(inspectedCommands?.workspaceValue));
  const userCommands = getValidCommands(inspectedCommands?.globalValue);
  const sections = [];

  if (workspaceCommands.length > 0) {
    sections.push({
      id: "workspace",
      label: "Project",
      commands: workspaceCommands
    });
  }

  if (userCommands.length > 0) {
    sections.push({
      id: "user",
      label: "User",
      commands: userCommands
    });
  }

  if (sections.length === 0) {
    sections.push({
      id: "default",
      label: "Default",
      commands: getValidCommands(inspectedCommands?.defaultValue || DEFAULT_COMMANDS)
    });
  }

  return sections;
}

function getValidCommands(value) {
  return Array.isArray(value) ? value.filter(isValidButtonConfig) : [];
}

function getUserSettingsUri() {
  const productDirectory = getSettingsProductDirectory();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;

    if (!appData) {
      throw new Error("APPDATA is not available.");
    }

    return vscode.Uri.file(`${appData}\\${productDirectory}\\User\\settings.json`);
  }

  if (process.platform === "darwin") {
    const home = process.env.HOME;

    if (!home) {
      throw new Error("HOME is not available.");
    }

    return vscode.Uri.file(`${home}/Library/Application Support/${productDirectory}/User/settings.json`);
  }

  const configHome = process.env.XDG_CONFIG_HOME || `${process.env.HOME}/.config`;

  if (!configHome) {
    throw new Error("User config directory is not available.");
  }

  return vscode.Uri.file(`${configHome}/${productDirectory}/User/settings.json`);
}

function getSettingsProductDirectory() {
  const appName = vscode.env.appName.toLowerCase();

  if (appName.includes("cursor")) {
    return "Cursor";
  }

  if (appName.includes("codium")) {
    return "VSCodium";
  }

  if (appName.includes("insiders")) {
    return "Code - Insiders";
  }

  return "Code";
}

async function ensureWorkspaceSettingsCommands(settingsUri) {
  if (settingsUri.scheme !== "file") {
    await vscode.workspace
      .getConfiguration("terminalButtons")
      .update("commands", DEFAULT_COMMANDS, vscode.ConfigurationTarget.WorkspaceFolder);
    return;
  }

  await fs.mkdir(path.dirname(settingsUri.fsPath), { recursive: true });

  let settings = {};

  try {
    const rawSettings = await fs.readFile(settingsUri.fsPath, "utf8");
    settings = rawSettings.trim() ? JSON.parse(rawSettings) : {};
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (!Array.isArray(settings["terminalButtons.commands"])) {
    settings["terminalButtons.commands"] = DEFAULT_COMMANDS;
  }

  await fs.writeFile(settingsUri.fsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function sanitizeCssColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();
  const isSafeColor = /^#[0-9a-fA-F]{3,8}$/.test(trimmedValue) || /^[a-zA-Z]+$/.test(trimmedValue);
  return isSafeColor ? trimmedValue : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return nonce;
}

class CommandDeckProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.view = undefined;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message && message.type === "run" && Number.isInteger(message.index)) {
        const command = getConfiguredCommands()[message.index];

        if (command) {
          runTerminalCommand(command);
        }
      }

      if (message && message.type === "settings") {
        vscode.commands.executeCommand("cursorTerminalButtons.openSettings");
      }

      if (message && message.type === "userSettings") {
        vscode.commands.executeCommand("cursorTerminalButtons.openUserSettings");
      }

      if (message && message.type === "refresh") {
        vscode.commands.executeCommand("cursorTerminalButtons.refresh");
      }

      if (message && message.type === "createSettings") {
        vscode.commands.executeCommand("cursorTerminalButtons.createWorkspaceSettings");
      }

      if (message && message.type === "toggleSize") {
        vscode.commands.executeCommand("cursorTerminalButtons.toggleCompactDeck");
      }
    });

    this.refresh();
  }

  refresh() {
    if (!this.view) {
      return;
    }

    this.view.webview.html = this.getHtml(this.view.webview);
  }

  getHtml(webview) {
    const nonce = getNonce();
    const sections = getConfiguredCommandSections();
    const commands = sections.flatMap((section) => section.commands);
    const compactDeck = vscode.workspace
      .getConfiguration("terminalButtons")
      .get("compactDeck", false);
    const cspSource = webview.cspSource;

    let commandIndex = 0;
    const commandSections = sections
      .map((section) => {
        const cards = section.commands
          .map((command) => {
            const index = commandIndex;
            commandIndex += 1;
            const paletteColor = DEFAULT_BUTTON_PALETTE[index % DEFAULT_BUTTON_PALETTE.length];
            const backgroundColor = sanitizeCssColor(command.backgroundColor, paletteColor.backgroundColor);
            const color = sanitizeCssColor(command.color, paletteColor.color);
            const description = command.description || command.command;

            return `
              <button class="command-card" style="--button-bg: ${backgroundColor}; --button-fg: ${color};" data-index="${index}">
                <span class="command-top">
                  <span class="command-label">${escapeHtml(command.label)}</span>
                  <span class="command-terminal">${escapeHtml(command.terminalName || command.label)}</span>
                </span>
                <span class="command-description">${escapeHtml(description)}</span>
                <span class="command-text">${escapeHtml(command.command)}</span>
              </button>
            `;
          })
          .join("");

        return `
          <section class="command-section" data-section="${escapeHtml(section.id)}">
            <h2 class="section-title">${escapeHtml(section.label)} Commands</h2>
            <div class="deck">
              ${cards}
            </div>
          </section>
        `;
      })
      .join("");

    const emptyState = `
      <div class="empty-state">
        <h2>No commands</h2>
        <p>Add commands in <code>terminalButtons.commands</code>.</p>
      </div>
    `;

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <title>Command Deck</title>
        <style>
          :root {
            color-scheme: light dark;
          }

          body {
            margin: 0;
            padding: 12px;
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
          }

          .toolbar {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 8px;
            margin-bottom: 10px;
          }

          .toolbar-button {
            appearance: none;
            padding: 5px 9px;
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 6px;
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
            font: inherit;
            line-height: 1.3;
            cursor: pointer;
          }

          .toolbar-button.secondary {
            color: var(--vscode-button-secondaryForeground);
            background: var(--vscode-button-secondaryBackground);
          }

          .toolbar-button:hover {
            background: var(--vscode-button-hoverBackground);
          }

          .deck {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            align-items: stretch;
          }

          .command-section {
            display: grid;
            gap: 8px;
            margin-bottom: 14px;
          }

          .section-title {
            margin: 0;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0;
            text-transform: uppercase;
          }

          .command-card {
            appearance: none;
            display: grid;
            gap: 8px;
            width: 100%;
            min-height: 108px;
            padding: 12px;
            border: 1px solid color-mix(in srgb, var(--button-bg), var(--vscode-panel-border) 42%);
            border-radius: 8px;
            color: var(--button-fg);
            background:
              linear-gradient(135deg, color-mix(in srgb, var(--button-bg), white 8%), var(--button-bg));
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            text-align: left;
            cursor: pointer;
          }

          .command-card:hover {
            filter: brightness(1.08);
          }

          .command-card:focus-visible {
            outline: 2px solid var(--vscode-focusBorder);
            outline-offset: 2px;
          }

          .command-top {
            display: flex;
            align-items: start;
            justify-content: space-between;
            gap: 10px;
          }

          .command-label {
            overflow-wrap: anywhere;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.25;
          }

          .command-terminal {
            flex: 0 1 auto;
            max-width: 42%;
            overflow: hidden;
            padding: 2px 6px;
            border-radius: 999px;
            color: color-mix(in srgb, var(--button-fg), transparent 10%);
            background: rgba(255, 255, 255, 0.18);
            font-size: 11px;
            line-height: 1.4;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .command-description,
          .command-text {
            overflow-wrap: anywhere;
            line-height: 1.35;
          }

          .command-description {
            color: color-mix(in srgb, var(--button-fg), transparent 16%);
          }

          .command-text {
            padding: 7px 8px;
            border-radius: 6px;
            color: color-mix(in srgb, var(--button-fg), transparent 6%);
            background: rgba(0, 0, 0, 0.2);
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
          }

          .empty-state {
            display: grid;
            gap: 6px;
            padding: 12px 4px;
          }

          .empty-state h2,
          .empty-state p {
            margin: 0;
          }

          body.compact {
            padding: 8px;
          }

          body.compact .toolbar {
            margin-bottom: 8px;
          }

          body.compact .deck {
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 8px;
          }

          body.compact .command-section {
            gap: 6px;
            margin-bottom: 10px;
          }

          body.compact .command-card {
            min-height: 64px;
            padding: 9px 10px;
            gap: 5px;
          }

          body.compact .command-label {
            font-size: 13px;
          }

          body.compact .command-terminal,
          body.compact .command-description {
            display: none;
          }

          body.compact .command-text {
            padding: 5px 6px;
            font-size: 11px;
            line-height: 1.25;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        </style>
      </head>
      <body class="${compactDeck ? "compact" : ""}">
        <nav class="toolbar" aria-label="Command list actions">
          <button class="toolbar-button secondary" type="button" data-action="refresh">Refresh</button>
          <button class="toolbar-button secondary" type="button" data-action="toggleSize">${compactDeck ? "Full Size" : "Mini Mode"}</button>
          <button class="toolbar-button" type="button" data-action="settings">Edit Project</button>
          <button class="toolbar-button" type="button" data-action="userSettings">Edit Global</button>
        </nav>
        <main>
          ${commands.length > 0 ? commandSections : emptyState}
        </main>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();

          document.querySelectorAll(".command-card").forEach((button) => {
            button.addEventListener("click", () => {
              vscode.postMessage({
                type: "run",
                index: Number(button.dataset.index)
              });
            });
          });

          document.querySelectorAll("[data-action]").forEach((button) => {
            button.addEventListener("click", () => {
              vscode.postMessage({
                type: button.dataset.action
              });
            });
          });
        </script>
      </body>
      </html>`;
  }
}

module.exports = {
  activate,
  deactivate
};
