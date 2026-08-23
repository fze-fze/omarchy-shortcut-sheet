function lower(value) {
  return String(value || "").toLowerCase()
}

function hasTag(tags, name) {
  var list = tags || []
  for (var i = 0; i < list.length; i++) {
    if (String(list[i]).replace(/\*+$/, "") === name) return true
  }
  return false
}

function className(win) {
  return lower(win && (win.class || win.initialClass))
}

function titleText(win) {
  return lower(win && win.title)
}

function isTerminal(win) {
  if (hasTag(win && win.tags, "terminal")) return true
  var cls = className(win)
  return /(^|[\.\-])(foot|kitty|alacritty|ghostty|wezterm|com\.mitchellh\.ghostty)($|[\.\-])/.test(cls)
}

function isBrowser(win) {
  var cls = className(win)
  if (/^chrome-/.test(cls)) return true
  return /(chromium|google-chrome|chrome|firefox|zen|brave|vivaldi|microsoft-edge)/.test(cls)
}

function webHost(win) {
  var cls = className(win)
  var match = cls.match(/^chrome-([^_]+)/)
  if (match) return match[1]
  return ""
}

function prettyAppName(win) {
  var cls = String((win && (win.class || win.initialClass)) || "")
  if (!cls) return "Desktop"
  var host = webHost(win)
  if (host) {
    host = host.replace(/^www\./, "")
    var mapped = {
      "x.com": "X",
      "twitter.com": "X",
      "mail.google.com": "Gmail",
      "github.com": "GitHub",
      "youtube.com": "YouTube",
      "chatgpt.com": "ChatGPT",
      "grok.com": "Grok",
      "maps.google.com": "Maps",
      "photos.google.com": "Photos",
      "web.whatsapp.com": "WhatsApp",
      "messages.google.com": "Messages"
    }
    if (mapped[host]) return mapped[host]
    return host
  }
  var last = cls.split(".").pop()
  if (last === "Nautilus") return "Files"
  if (last === "agent") return "Agent"
  if (!last) return cls
  return last.charAt(0).toUpperCase() + last.slice(1)
}

function item(keys, label) {
  return { keys: keys, label: label, kind: "app", dispatcher: "sendshortcut", arg: "" }
}

function sendArg(keys) {
  var mods = []
  var key = ""
  var parts = String(keys || "").split("+")
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].replace(/^\s+|\s+$/g, "")
    var upper = part.toUpperCase()
    if (upper === "CTRL" || upper === "CONTROL") mods.push("CTRL")
    else if (upper === "SHIFT") mods.push("SHIFT")
    else if (upper === "ALT") mods.push("ALT")
    else if (upper === "SUPER") mods.push("SUPER")
    else key = part
  }
  var keyMap = {
    "Enter": "Return",
    "Esc": "Escape",
    "←": "Left",
    "→": "Right",
    "↑": "Up",
    "↓": "Down",
    ",": "comma",
    ".": "period",
    "-": "minus",
    "=": "equal",
    "/": "slash",
    "`": "grave",
    "[": "bracketleft",
    "]": "bracketright"
  }
  if (keyMap[key]) key = keyMap[key]
  return mods.join(" ") + "," + key + ","
}

function canSend(keys) {
  var text = String(keys || "")
  if (text.indexOf("then") !== -1) return false
  if (text.indexOf(" / ") !== -1) return false
  if (text.indexOf("Mouse ") === 0) return false
  if (text.indexOf(":") !== -1) return false
  return true
}

function withSend(list, address) {
  var out = []
  for (var i = 0; i < list.length; i++) {
    var row = list[i]
    var runnable = canSend(row.keys)
    out.push({
      keys: row.keys,
      label: row.label,
      kind: "app",
      dispatcher: runnable ? "sendshortcut" : "",
      arg: runnable ? sendArg(row.keys) + (address ? "address:" + address : "") : ""
    })
  }
  return out
}

function grokShortcuts() {
  return [
    item("Enter", "Send prompt"),
    item("Esc", "Cancel / clear / rewind"),
    item("Tab", "Toggle prompt / scrollback"),
    item("Space", "Focus prompt from scrollback"),
    item("↑", "Previous entry"),
    item("↓", "Next entry"),
    item("Shift + ←", "Previous turn"),
    item("Shift + →", "Next turn"),
    item("PageUp", "Scroll up a page"),
    item("PageDown", "Scroll down a page"),
    item("Ctrl + C", "Stop the current turn"),
    item("Ctrl + L", "Clear scrollback")
  ]
}

function terminalShortcuts() {
  return [
    item("Ctrl + Shift + C", "Copy"),
    item("Ctrl + Shift + V", "Paste"),
    item("Shift + Insert", "Paste"),
    item("Ctrl + Shift + T", "New tab"),
    item("Ctrl + Shift + W", "Close tab"),
    item("Ctrl + Shift + N", "New window"),
    item("Ctrl + Shift + F", "Search"),
    item("Ctrl + Shift + =", "Zoom in"),
    item("Ctrl + -", "Zoom out")
  ]
}

function tuiBinding(keys, label, context, action) {
  return {
    keys: keys,
    label: label,
    context: context || "",
    action: action || "",
    kind: "app",
    dispatcher: "sendshortcut",
    arg: ""
  }
}

// Keep built-in defaults pinned to versions whose map has been checked
// against the installed client. Unknown versions fall back to explicit
// ~/.claude/keybindings.json entries instead of guessing.
function claudeDefaultBindings(version) {
  if (String(version || "") !== "2.1.238") return []
  return [
    tuiBinding("Ctrl + C", "Cancel current operation", "Global", "app:interrupt"),
    tuiBinding("Ctrl + D", "Exit Claude Code", "Global", "app:exit"),
    tuiBinding("Ctrl + T", "Toggle task list", "Global", "app:toggleTodos"),
    tuiBinding("Ctrl + O", "Toggle transcript viewer", "Global", "app:toggleTranscript"),
    tuiBinding("Ctrl + R", "Search prompt history", "History", "history:search"),
    tuiBinding("↑", "Previous history item", "History", "history:previous"),
    tuiBinding("↓", "Next history item", "History", "history:next"),
    tuiBinding("Esc", "Cancel current input", "Chat", "chat:cancel"),
    tuiBinding("Ctrl + L", "Redraw screen", "Chat", "chat:clearInput"),
    tuiBinding("Ctrl + X then Ctrl + K", "Kill background agents", "Chat", "chat:killAgents"),
    tuiBinding("Shift + Tab", "Cycle permission modes", "Chat", "chat:cycleMode"),
    tuiBinding("Alt + P", "Open model picker", "Chat", "chat:modelPicker"),
    tuiBinding("Alt + O", "Toggle fast mode", "Chat", "chat:fastMode"),
    tuiBinding("Alt + T", "Toggle extended thinking", "Chat", "chat:thinkingToggle"),
    tuiBinding("Enter", "Submit message", "Chat", "chat:submit"),
    tuiBinding("Ctrl + J", "Insert newline", "Chat", "chat:newline"),
    tuiBinding("Ctrl + _", "Undo last action", "Chat", "chat:undo"),
    tuiBinding("Ctrl + Shift + -", "Undo last action", "Chat", "chat:undo"),
    tuiBinding("Ctrl + G", "Open external editor", "Chat", "chat:externalEditor"),
    tuiBinding("Ctrl + X then Ctrl + E", "Open external editor", "Chat", "chat:externalEditor"),
    tuiBinding("Ctrl + S", "Stash current prompt", "Chat", "chat:stash"),
    tuiBinding("Ctrl + V", "Paste image", "Chat", "chat:imagePaste"),
    tuiBinding("Ctrl + B", "Background current task", "Task", "task:background"),
    tuiBinding("Ctrl + X then Ctrl + B", "Background current task", "Task", "task:background"),
    tuiBinding("Ctrl + T", "Toggle syntax highlighting", "ThemePicker", "theme:toggleSyntaxHighlighting"),
    tuiBinding("Esc", "Close help menu", "Help", "help:dismiss"),

    tuiBinding("Tab", "Accept suggestion", "Autocomplete", "autocomplete:accept"),
    tuiBinding("Esc", "Dismiss suggestions", "Autocomplete", "autocomplete:dismiss"),
    tuiBinding("↑", "Previous suggestion", "Autocomplete", "autocomplete:previous"),
    tuiBinding("↓", "Next suggestion", "Autocomplete", "autocomplete:next"),
    tuiBinding("Y", "Confirm action", "Confirmation", "confirm:yes"),
    tuiBinding("Enter", "Confirm action", "Confirmation", "confirm:yes"),
    tuiBinding("N", "Decline action", "Confirmation", "confirm:no"),
    tuiBinding("Esc", "Decline action", "Confirmation", "confirm:no"),
    tuiBinding("↑", "Previous option", "Confirmation", "confirm:previous"),
    tuiBinding("↓", "Next option", "Confirmation", "confirm:next"),
    tuiBinding("Tab", "Next field", "Confirmation", "confirm:nextField"),
    tuiBinding("Space", "Toggle selection", "Confirmation", "confirm:toggle"),
    tuiBinding("Shift + Tab", "Cycle permission modes", "Confirmation", "confirm:cycleMode"),
    tuiBinding("Ctrl + E", "Toggle command explanation", "Confirmation", "confirm:toggleExplanation"),
    tuiBinding("Ctrl + E", "Toggle all transcript content", "Transcript", "transcript:toggleShowAll"),
    tuiBinding("Q", "Exit transcript viewer", "Transcript", "transcript:exit"),
    tuiBinding("Ctrl + C", "Exit transcript viewer", "Transcript", "transcript:exit"),
    tuiBinding("Esc", "Exit transcript viewer", "Transcript", "transcript:exit"),
    tuiBinding("Ctrl + R", "Next history match", "HistorySearch", "historySearch:next"),
    tuiBinding("Tab", "Accept history match", "HistorySearch", "historySearch:accept"),
    tuiBinding("Esc", "Accept history match", "HistorySearch", "historySearch:accept"),
    tuiBinding("Ctrl + C", "Cancel history search", "HistorySearch", "historySearch:cancel"),
    tuiBinding("Enter", "Execute history match", "HistorySearch", "historySearch:execute"),
    tuiBinding("Ctrl + S", "Cycle history scope", "HistorySearch", "historySearch:cycleScope"),
    tuiBinding("Tab", "Next tab", "Tabs", "tabs:next"),
    tuiBinding("→", "Next tab", "Tabs", "tabs:next"),
    tuiBinding("Shift + Tab", "Previous tab", "Tabs", "tabs:previous"),
    tuiBinding("←", "Previous tab", "Tabs", "tabs:previous"),
    tuiBinding("→", "Next attachment", "Attachments", "attachments:next"),
    tuiBinding("←", "Previous attachment", "Attachments", "attachments:previous"),
    tuiBinding("Backspace", "Remove attachment", "Attachments", "attachments:remove"),
    tuiBinding("Delete", "Remove attachment", "Attachments", "attachments:remove"),
    tuiBinding("↓", "Exit attachment navigation", "Attachments", "attachments:exit"),
    tuiBinding("Esc", "Exit attachment navigation", "Attachments", "attachments:exit"),
    tuiBinding("→", "Next footer item", "Footer", "footer:next"),
    tuiBinding("←", "Previous footer item", "Footer", "footer:previous"),
    tuiBinding("↑", "Navigate up", "Footer", "footer:up"),
    tuiBinding("↓", "Navigate down", "Footer", "footer:down"),
    tuiBinding("Enter", "Open selected footer item", "Footer", "footer:openSelected"),
    tuiBinding("Esc", "Clear footer selection", "Footer", "footer:clearSelection"),
    tuiBinding("Backspace", "Dismiss selected artifact", "Footer", "footer:dismiss"),
    tuiBinding("Delete", "Dismiss selected artifact", "Footer", "footer:dismiss"),
    tuiBinding("↑", "Move up", "MessageSelector", "messageSelector:up"),
    tuiBinding("K", "Move up", "MessageSelector", "messageSelector:up"),
    tuiBinding("Ctrl + P", "Move up", "MessageSelector", "messageSelector:up"),
    tuiBinding("↓", "Move down", "MessageSelector", "messageSelector:down"),
    tuiBinding("J", "Move down", "MessageSelector", "messageSelector:down"),
    tuiBinding("Ctrl + N", "Move down", "MessageSelector", "messageSelector:down"),
    tuiBinding("Ctrl + ↑", "Jump to top", "MessageSelector", "messageSelector:top"),
    tuiBinding("Shift + ↑", "Jump to top", "MessageSelector", "messageSelector:top"),
    tuiBinding("Alt + ↑", "Jump to top", "MessageSelector", "messageSelector:top"),
    tuiBinding("Shift + K", "Jump to top", "MessageSelector", "messageSelector:top"),
    tuiBinding("Ctrl + ↓", "Jump to bottom", "MessageSelector", "messageSelector:bottom"),
    tuiBinding("Shift + ↓", "Jump to bottom", "MessageSelector", "messageSelector:bottom"),
    tuiBinding("Alt + ↓", "Jump to bottom", "MessageSelector", "messageSelector:bottom"),
    tuiBinding("Shift + J", "Jump to bottom", "MessageSelector", "messageSelector:bottom"),
    tuiBinding("Enter", "Select message", "MessageSelector", "messageSelector:select"),
    tuiBinding("Esc", "Close diff viewer", "DiffDialog", "diff:dismiss"),
    tuiBinding("←", "Previous diff source", "DiffDialog", "diff:previousSource"),
    tuiBinding("→", "Next diff source", "DiffDialog", "diff:nextSource"),
    tuiBinding("↑", "Previous diff file", "DiffDialog", "diff:previousFile"),
    tuiBinding("K", "Previous diff file", "DiffDialog", "diff:previousFile"),
    tuiBinding("↓", "Next diff file", "DiffDialog", "diff:nextFile"),
    tuiBinding("J", "Next diff file", "DiffDialog", "diff:nextFile"),
    tuiBinding("Enter", "View diff details", "DiffDialog", "diff:viewDetails"),
    tuiBinding("PageUp", "Scroll up half a page", "DiffDialog", "scroll:pageUp"),
    tuiBinding("PageDown", "Scroll down half a page", "DiffDialog", "scroll:pageDown"),
    tuiBinding("Shift + Space", "Scroll up a full page", "DiffDialog", "scroll:fullPageUp"),
    tuiBinding("B", "Scroll up a full page", "DiffDialog", "scroll:fullPageUp"),
    tuiBinding("Space", "Scroll down a full page", "DiffDialog", "scroll:fullPageDown"),
    tuiBinding("G", "Jump to diff top", "DiffDialog", "scroll:top"),
    tuiBinding("Home", "Jump to diff top", "DiffDialog", "scroll:top"),
    tuiBinding("Shift + G", "Jump to diff bottom", "DiffDialog", "scroll:bottom"),
    tuiBinding("End", "Jump to diff bottom", "DiffDialog", "scroll:bottom"),
    tuiBinding("←", "Decrease effort level", "ModelPicker", "modelPicker:decreaseEffort"),
    tuiBinding("→", "Increase effort level", "ModelPicker", "modelPicker:increaseEffort"),
    tuiBinding("S", "Apply to this session only", "ModelPicker", "modelPicker:thisSessionOnly"),
    tuiBinding("↓", "Next option", "Select", "select:next"),
    tuiBinding("J", "Next option", "Select", "select:next"),
    tuiBinding("Ctrl + N", "Next option", "Select", "select:next"),
    tuiBinding("↑", "Previous option", "Select", "select:previous"),
    tuiBinding("K", "Previous option", "Select", "select:previous"),
    tuiBinding("Ctrl + P", "Previous option", "Select", "select:previous"),
    tuiBinding("Enter", "Accept selection", "Select", "select:accept"),
    tuiBinding("Esc", "Cancel selection", "Select", "select:cancel"),
    tuiBinding("Space", "Toggle plugin selection", "Plugin", "plugin:toggle"),
    tuiBinding("I", "Install selected plugin", "Plugin", "plugin:install"),
    tuiBinding("F", "Favorite selected plugin", "Plugin", "plugin:favorite"),
    tuiBinding("/", "Search settings", "Settings", "settings:search"),
    tuiBinding("R", "Retry loading", "Settings", "settings:retry"),
    tuiBinding("Enter", "Change selected setting", "Settings", "select:accept"),
    tuiBinding("Space", "Change selected setting", "Settings", "select:accept"),
    tuiBinding("Esc", "Close settings", "Settings", "confirm:no"),
    tuiBinding("PageUp", "Scroll up half a page", "Scroll", "scroll:pageUp"),
    tuiBinding("PageDown", "Scroll down half a page", "Scroll", "scroll:pageDown"),
    tuiBinding("Ctrl + Home", "Jump to conversation start", "Scroll", "scroll:top"),
    tuiBinding("Ctrl + End", "Jump to conversation end", "Scroll", "scroll:bottom"),
    tuiBinding("Ctrl + Shift + C", "Copy selected text", "Scroll", "selection:copy"),
    tuiBinding("Shift + ←", "Extend selection left", "Scroll", "selection:extendLeft"),
    tuiBinding("Shift + →", "Extend selection right", "Scroll", "selection:extendRight"),
    tuiBinding("Shift + ↑", "Extend selection up", "Scroll", "selection:extendUp"),
    tuiBinding("Shift + ↓", "Extend selection down", "Scroll", "selection:extendDown"),
    tuiBinding("Shift + Home", "Extend selection to line start", "Scroll", "selection:extendLineStart"),
    tuiBinding("Shift + End", "Extend selection to line end", "Scroll", "selection:extendLineEnd")
  ]
}

function canonicalBindingKey(value) {
  return String(value || "")
    .replace(/\s+then\s+/gi, " ")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s+/g, " ")
    .replace(/\b(control)\b/gi, "ctrl")
    .replace(/\b(opt|option|meta)\b/gi, "alt")
    .replace(/\b(command|cmd|win)\b/gi, "super")
    .replace(/\b(return)\b/gi, "enter")
    .replace(/\besc\b/gi, "escape")
    .toLowerCase()
    .replace(/^\s+|\s+$/g, "")
}

function displayBindingStroke(stroke) {
  var text = String(stroke || "")
  if (/^[A-Z]$/.test(text)) return "Shift + " + text
  var parts = text.split("+")
  var labels = []
  var keyLabels = {
    escape: "Esc", enter: "Enter", return: "Enter", tab: "Tab", space: "Space",
    up: "↑", down: "↓", left: "←", right: "→", backspace: "Backspace",
    delete: "Delete", pageup: "PageUp", pagedown: "PageDown", home: "Home", end: "End"
  }
  for (var i = 0; i < parts.length; i++) {
    var piece = parts[i].replace(/^\s+|\s+$/g, "")
    var lowerPiece = lower(piece)
    if (lowerPiece === "ctrl" || lowerPiece === "control") labels.push("Ctrl")
    else if (lowerPiece === "shift") labels.push("Shift")
    else if (/^(alt|opt|option|meta)$/.test(lowerPiece)) labels.push("Alt")
    else if (/^(cmd|command|super|win)$/.test(lowerPiece)) labels.push("Super")
    else if (parts.length > 1 && /^[a-z]$/.test(piece)) labels.push(piece.toUpperCase())
    else labels.push(keyLabels[lowerPiece] || piece)
  }
  return labels.join(" + ")
}

function displayBindingKeys(value) {
  var strokes = String(value || "").replace(/^\s+|\s+$/g, "").split(/\s+/)
  var labels = []
  for (var i = 0; i < strokes.length; i++) {
    var label = displayBindingStroke(strokes[i])
    if (label) labels.push(label)
  }
  return labels.join(" then ")
}

function friendlyAction(action) {
  var text = String(action || "")
  var piece = text.indexOf(":") >= 0 ? text.split(":").pop() : text
  piece = piece.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
  if (!piece) return "Custom action"
  return piece.charAt(0).toUpperCase() + piece.slice(1)
}

function mergedClaudeBindings(version, customBindings) {
  var rows = claudeDefaultBindings(version)
  var actionLabels = {}
  for (var i = 0; i < rows.length; i++) {
    var contextualAction = lower(rows[i].context) + "\n" + rows[i].action
    if (!actionLabels[contextualAction]) actionLabels[contextualAction] = rows[i].label
    if (!actionLabels[rows[i].action]) actionLabels[rows[i].action] = rows[i].label
  }

  var custom = customBindings || []
  for (var c = 0; c < custom.length; c++) {
    var override = custom[c] || {}
    var context = String(override.context || "")
    var key = canonicalBindingKey(override.keys)
    if (!context || !key) continue

    var kept = []
    for (var r = 0; r < rows.length; r++) {
      if (lower(rows[r].context) === lower(context)
          && canonicalBindingKey(rows[r].keys) === key)
        continue
      kept.push(rows[r])
    }
    rows = kept
    if (override.action === null || override.action === undefined) continue

    var action = String(override.action)
    rows.push(tuiBinding(
      displayBindingKeys(override.keys),
      actionLabels[lower(context) + "\n" + action] || actionLabels[action] || friendlyAction(action),
      context,
      action
    ))
  }
  return rows
}

function lazygitShortcuts() {
  return [
    item("j / k", "Move"),
    item("Enter", "Open"),
    item("Space", "Select"),
    item("c", "Commit"),
    item("p", "Pull"),
    item("P", "Push"),
    item("q", "Quit"),
    item("?", "Help")
  ]
}

function matchTui(tui) {
  var id = lower(tui && tui.id)
  if (!id) return null
  if (id === "claude") {
    var merged = mergedClaudeBindings(tui.version, tui.bindings)
    var primary = []
    var views = []
    for (var i = 0; i < merged.length; i++) {
      var row = merged[i]
      if (/^(global|chat|history|task)$/i.test(row.context)) primary.push(row)
      else {
        row.label = row.context + " · " + row.label
        views.push(row)
      }
    }
    return {
      page: { name: "Claude Code", shortcuts: primary },
      extraPages: views.length ? [{ name: "Claude Views", shortcuts: views }] : []
    }
  }

  return null
}

function browserShortcuts() {
  return [
    item("Ctrl + T", "New tab"),
    item("Ctrl + W", "Close tab"),
    item("Ctrl + Shift + T", "Reopen closed tab"),
    item("Ctrl + L", "Focus address bar"),
    item("Ctrl + Tab", "Next tab"),
    item("Ctrl + Shift + Tab", "Previous tab"),
    item("Ctrl + R", "Reload"),
    item("Ctrl + F", "Find on page"),
    item("Alt + ←", "Back"),
    item("Alt + →", "Forward"),
    item("Ctrl + N", "New window"),
    item("F11", "Full screen")
  ]
}

function gmailShortcuts() {
  return [
    item("C", "Compose"),
    item("E", "Archive"),
    item("#", "Delete"),
    item("R", "Reply"),
    item("A", "Reply all"),
    item("F", "Forward"),
    item("/", "Search"),
    item("J", "Newer conversation"),
    item("K", "Older conversation"),
    item("X", "Select conversation"),
    item("Enter", "Open"),
    item("Esc", "Back")
  ]
}

function githubShortcuts() {
  return [
    item("S", "Focus search"),
    item("T", "Find a file"),
    item("L", "Jump to a line"),
    item("W", "Switch branch"),
    item("?", "Keyboard shortcuts"),
    item("G then I", "Go to issues"),
    item("G then P", "Go to pull requests"),
    item("G then C", "Go to code")
  ]
}

function youtubeShortcuts() {
  return [
    item("Space", "Play / pause"),
    item("F", "Full screen"),
    item("M", "Mute"),
    item("←", "Back 5 seconds"),
    item("→", "Forward 5 seconds"),
    item("↑", "Volume up"),
    item("↓", "Volume down"),
    item("J", "Back 10 seconds"),
    item("K", "Play / pause"),
    item("L", "Forward 10 seconds"),
    item("C", "Captions")
  ]
}

function xShortcuts() {
  return [
    item("N", "New post"),
    item("L", "Like"),
    item("R", "Reply"),
    item("T", "Repost"),
    item("/", "Search"),
    item("J", "Next post"),
    item("K", "Previous post"),
    item(".", "Load new posts"),
    item("Esc", "Close panel")
  ]
}

function chatgptWebShortcuts() {
  return [
    item("Enter", "Send"),
    item("Shift + Enter", "New line"),
    item("Ctrl + Shift + ;", "Copy last response"),
    item("Ctrl + Shift + O", "New chat"),
    item("Ctrl + Shift + S", "Toggle sidebar")
  ]
}

// Linux defaults shipped by the ChatGPT/Codex desktop app. Keep these
// separate from chatgpt.com because the desktop shell owns most of them.
function chatgptDesktopShortcuts() {
  return [
    item("Enter", "Send"),
    item("Shift + Enter", "New line"),
    item("Ctrl + B", "Toggle sidebar"),
    item("Ctrl + J", "Toggle bottom panel"),
    item("Ctrl + `", "Toggle terminal"),
    item("Ctrl + T", "Open browser tab"),
    item("Ctrl + Shift + B", "Toggle browser panel"),
    item("Ctrl + Alt + B", "Toggle review panel"),
    item("Ctrl + Shift + G", "Open review tab"),
    item("Ctrl + K", "Command menu"),
    item("Ctrl + Shift + P", "Command menu"),
    item("Ctrl + /", "Keyboard shortcuts"),
    item("Ctrl + ,", "Settings"),
    item("Ctrl + N", "New chat"),
    item("Ctrl + Shift + O", "New chat"),
    item("Ctrl + Shift + N", "New temporary chat"),
    item("Ctrl + Alt + N", "Quick chat"),
    item("Ctrl + Alt + O", "New standalone chat"),
    item("Ctrl + Alt + Shift + O", "Open project picker"),
    item("Ctrl + O", "Open folder"),
    item("Ctrl + P", "Search files"),
    item("Ctrl + F", "Find in thread"),
    item("Ctrl + L", "Focus address bar / go to line"),
    item("Ctrl + Shift + E", "Toggle file tree"),
    item("Ctrl + Alt + S", "Open side chat"),
    item("Ctrl + Shift + A", "Archive chat"),
    item("Ctrl + Shift + U", "Mark chat unread"),
    item("Ctrl + Alt + P", "Pin / unpin chat"),
    item("Ctrl + Alt + R", "Rename chat"),
    item("Ctrl + Alt + U", "Toggle priority filter"),
    item("Ctrl + Alt + A", "Next chat needing attention"),
    item("Ctrl + Tab", "Next recent chat"),
    item("Ctrl + Shift + Tab", "Previous recent chat"),
    item("Ctrl + Shift + ]", "Next tab / chat"),
    item("Ctrl + Shift + [", "Previous tab / chat"),
    item("Ctrl + 1", "Open chat 1"),
    item("Ctrl + 2", "Open chat 2"),
    item("Ctrl + 3", "Open chat 3"),
    item("Ctrl + 4", "Open chat 4"),
    item("Ctrl + 5", "Open chat 5"),
    item("Ctrl + 6", "Open chat 6"),
    item("Ctrl + 7", "Open chat 7"),
    item("Ctrl + 8", "Open chat 8"),
    item("Ctrl + 9", "Open chat 9"),
    item("Ctrl + [", "Back"),
    item("Ctrl + ]", "Forward"),
    item("Mouse Back", "Back"),
    item("Alt + ←", "Browser back"),
    item("Alt + →", "Browser forward"),
    item("Ctrl + W", "Close tab / window"),
    item("Ctrl + R", "Reload browser page"),
    item("Ctrl + Shift + R", "Force reload browser page"),
    item("Ctrl + Z", "Undo"),
    item("Ctrl + Y", "Redo"),
    item("Ctrl + Shift + Z", "Redo"),
    item("Ctrl + Shift + M", "Model picker"),
    item("Ctrl + Shift + V", "Voice mode"),
    item("Ctrl + Shift + D", "Dictation"),
    item("Shift + Esc", "Clear unread indicators"),
    item("Ctrl + Shift + C", "Copy working directory"),
    item("Ctrl + Alt + C", "Copy session ID"),
    item("Ctrl + Alt + L", "Copy deeplink"),
    item("Ctrl + Alt + Shift + C", "Copy conversation path"),
    item("Ctrl + Shift + S", "Toggle trace recording"),
    item("Alt + 3", "Switch to Codex"),
    item("Alt + D", "Toggle debug modal"),
    item("Esc", "Decline approval")
  ]
}

function typoraShortcuts() {
  return [
    item("Ctrl + B", "Bold"),
    item("Ctrl + I", "Italic"),
    item("Ctrl + K", "Link"),
    item("Ctrl + Shift + M", "Math block"),
    item("Ctrl + /", "Code"),
    item("Ctrl + S", "Save"),
    item("Ctrl + P", "Preview / source"),
    item("Ctrl + F", "Find"),
    item("Ctrl + H", "Replace"),
    item("Ctrl + Shift + L", "Task list"),
    item("Ctrl + Home", "Go to start"),
    item("Ctrl + End", "Go to end")
  ]
}

function filesShortcuts() {
  return [
    item("Ctrl + N", "New window"),
    item("Ctrl + T", "New tab"),
    item("Ctrl + W", "Close tab"),
    item("Ctrl + L", "Focus location"),
    item("Ctrl + H", "Show hidden files"),
    item("Ctrl + D", "Bookmark"),
    item("Delete", "Move to trash"),
    item("F2", "Rename"),
    item("Alt + ↑", "Go up"),
    item("Ctrl + 1", "List view"),
    item("Ctrl + 2", "Grid view")
  ]
}

function vscodeShortcuts() {
  return [
    item("Ctrl + P", "Go to file"),
    item("Ctrl + Shift + P", "Command palette"),
    item("Ctrl + B", "Toggle sidebar"),
    item("Ctrl + `", "Toggle terminal"),
    item("Ctrl + P then @", "Go to symbol"),
    item("Ctrl + /", "Toggle comment"),
    item("Ctrl + F", "Find"),
    item("Ctrl + H", "Replace"),
    item("Ctrl + Shift + N", "New window"),
    item("Ctrl + W", "Close editor")
  ]
}

function nvimShortcuts() {
  return [
    item("Esc", "Normal mode"),
    item("i", "Insert mode"),
    item(":w", "Save"),
    item(":q", "Quit"),
    item("yy", "Yank line"),
    item("p", "Paste"),
    item("dd", "Delete line"),
    item("/", "Search"),
    item("gg", "Top of file"),
    item("G", "Bottom of file")
  ]
}

function qqShortcuts() {
  return [
    item("Enter", "Send message"),
    item("Ctrl + Enter", "New line"),
    item("Ctrl + F", "Search"),
    item("Ctrl + Shift + A", "Screenshot"),
    item("Alt + Z", "Show / hide window")
  ]
}

function agentShortcuts() {
  return [
    item("Enter", "Send"),
    item("Esc", "Cancel"),
    item("Ctrl + C", "Stop"),
    item("Tab", "Complete / switch pane"),
    item("↑", "Previous prompt")
  ]
}

function matchPage(win) {
  var title = titleText(win)
  var host = webHost(win)
  var cls = className(win)

  if (isTerminal(win) && /\bgrok\b/.test(title))
    return { name: "Grok", shortcuts: grokShortcuts() }
  if (isTerminal(win) && /(^|[^a-z])n?vim([^a-z]|$)|helix|lazygit/.test(title)) {
    if (/lazygit/.test(title))
      return { name: "lazygit", shortcuts: lazygitShortcuts() }
    return { name: "Neovim", shortcuts: nvimShortcuts() }
  }

  if (host.indexOf("mail.google.com") !== -1 || /gmail/.test(title))
    return { name: "Gmail", shortcuts: gmailShortcuts() }
  if (host.indexOf("github.com") !== -1 || /\bgithub\b/.test(title))
    return { name: "GitHub", shortcuts: githubShortcuts() }
  if (host.indexOf("youtube.com") !== -1 || /youtube/.test(title))
    return { name: "YouTube", shortcuts: youtubeShortcuts() }
  if (host === "x.com" || host.indexOf("twitter.com") !== -1)
    return { name: "X", shortcuts: xShortcuts() }
  if (/^(chatgpt|com\.openai\.chatgpt)$/.test(cls))
    return { name: "ChatGPT", shortcuts: chatgptDesktopShortcuts() }
  if (host.indexOf("chatgpt.com") !== -1 || /chatgpt/.test(title))
    return { name: "ChatGPT", shortcuts: chatgptWebShortcuts() }
  if (host.indexOf("grok.com") !== -1)
    return { name: "Grok", shortcuts: chatgptWebShortcuts() }

  if (/typora/.test(cls))
    return { name: "Typora", shortcuts: typoraShortcuts() }
  if (/nautilus|org\.gnome\.files/.test(cls))
    return { name: "Files", shortcuts: filesShortcuts() }
  if (/(code|cursor|vscodium)/.test(cls) && !/chrome/.test(cls))
    return { name: "Editor", shortcuts: vscodeShortcuts() }
  if (cls === "qq" || /linuxqq/.test(cls))
    return { name: "QQ", shortcuts: qqShortcuts() }
  if (/org\.omarchy\.agent/.test(cls))
    return { name: "Agent", shortcuts: agentShortcuts() }

  return null
}

function matchApp(win, pageName) {
  if (isTerminal(win) && pageName !== "Grok" && pageName !== "Neovim" && pageName !== "lazygit")
    return { name: "Terminal", shortcuts: terminalShortcuts() }
  if (isTerminal(win) && (pageName === "Grok" || pageName === "Neovim" || pageName === "lazygit"))
    return { name: "Terminal", shortcuts: terminalShortcuts() }
  if (isBrowser(win) && pageName !== "Typora" && pageName !== "Files")
    return { name: "Browser", shortcuts: browserShortcuts() }
  if (/typora/.test(className(win)))
    return { name: "Typora", shortcuts: typoraShortcuts() }
  if (/nautilus/.test(className(win)))
    return { name: "Files", shortcuts: filesShortcuts() }
  return null
}

function context(win, tui) {
  var tuiMatch = matchTui(tui || {})
  var page = tuiMatch ? tuiMatch.page : matchPage(win)
  var extraPages = tuiMatch ? tuiMatch.extraPages : []
  var app = matchApp(win, page ? page.name : "")
  var address = win && win.address ? String(win.address) : ""
  var renderedExtraPages = []
  for (var i = 0; i < extraPages.length; i++)
    renderedExtraPages.push({ name: extraPages[i].name, items: withSend(extraPages[i].shortcuts, address) })
  return {
    appName: prettyAppName(win),
    title: String((win && win.title) || ""),
    address: address,
    page: page ? { name: page.name, items: withSend(page.shortcuts, address) } : null,
    extraPages: renderedExtraPages,
    app: app && (!page || app.name !== page.name)
      ? { name: app.name, items: withSend(app.shortcuts, address) }
      : null
  }
}
