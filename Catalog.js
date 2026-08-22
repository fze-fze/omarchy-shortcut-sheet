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

function chatgptShortcuts() {
  return [
    item("Enter", "Send"),
    item("Shift + Enter", "New line"),
    item("Ctrl + Shift + ;", "Copy last response"),
    item("Ctrl + Shift + O", "New chat"),
    item("Ctrl + Shift + S", "Toggle sidebar")
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
      return { name: "lazygit", shortcuts: [
        item("j / k", "Move"),
        item("Enter", "Open"),
        item("Space", "Select"),
        item("c", "Commit"),
        item("p", "Pull"),
        item("P", "Push"),
        item("q", "Quit"),
        item("?", "Help")
      ] }
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
  if (host.indexOf("chatgpt.com") !== -1 || /chatgpt/.test(title))
    return { name: "ChatGPT", shortcuts: chatgptShortcuts() }
  if (host.indexOf("grok.com") !== -1)
    return { name: "Grok", shortcuts: chatgptShortcuts() }

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

function context(win) {
  var page = matchPage(win)
  var app = matchApp(win, page ? page.name : "")
  var address = win && win.address ? String(win.address) : ""
  return {
    appName: prettyAppName(win),
    title: String((win && win.title) || ""),
    address: address,
    page: page ? { name: page.name, items: withSend(page.shortcuts, address) } : null,
    app: app && (!page || app.name !== page.name)
      ? { name: app.name, items: withSend(app.shortcuts, address) }
      : null
  }
}
