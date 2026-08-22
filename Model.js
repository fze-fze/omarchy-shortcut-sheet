.import "Catalog.js" as Catalog

function parsePayload(raw) {
  try {
    var parsed = JSON.parse(String(raw || "{}"))
    if (!parsed || typeof parsed !== "object") return { window: {}, binds: [] }
    return {
      window: parsed.window && typeof parsed.window === "object" ? parsed.window : {},
      binds: Array.isArray(parsed.binds) ? parsed.binds : []
    }
  } catch (e) {
    return { window: {}, binds: [] }
  }
}

var KEY_LABELS = {
  SUPER: "Super",
  SHIFT: "Shift",
  CTRL: "Ctrl",
  CONTROL: "Ctrl",
  ALT: "Alt",
  RETURN: "Enter",
  ESCAPE: "Esc",
  PRINT: "Print",
  BACKSPACE: "Backspace",
  TAB: "Tab",
  SPACE: "Space",
  COMMA: ",",
  PERIOD: ".",
  MINUS: "−",
  EQUAL: "=",
  SLASH: "/",
  LEFT: "←",
  RIGHT: "→",
  UP: "↑",
  DOWN: "↓",
  BRACKETLEFT: "[",
  BRACKETRIGHT: "]",
  DELETE: "Del",
  INSERT: "Ins",
  HOME: "Home",
  END: "End",
  PAGEUP: "PgUp",
  PAGEDOWN: "PgDn"
}

function prettyKey(chunk) {
  var piece = String(chunk || "").replace(/^\s+|\s+$/g, "")
  if (!piece) return ""
  var upper = piece.toUpperCase()
  if (upper === "+") return "+"
  return KEY_LABELS[upper] || piece
}

function keyParts(keys) {
  var text = String(keys || "").replace(/^\s+|\s+$/g, "")
  if (!text) return []
  var chunks = text.indexOf(" + ") !== -1 ? text.split(" + ") : text.split("+")
  var parts = []
  for (var i = 0; i < chunks.length; i++) {
    var piece = chunks[i].replace(/^\s+|\s+$/g, "")
    if (!piece) continue
    if (i === 0 && piece.indexOf(" ") !== -1) {
      var mods = piece.split(/\s+/)
      for (var m = 0; m < mods.length; m++) {
        var pretty = prettyKey(mods[m])
        if (pretty) parts.push(pretty)
      }
    } else {
      var label = prettyKey(piece)
      if (label) parts.push(label)
    }
  }
  return parts
}

function normalizeKeys(keys) {
  return keyParts(keys).join(" ").toUpperCase()
}

function isMouse(keys) {
  return /MOUSE|code:\d+/i.test(String(keys || ""))
}

function isMediaKey(keys) {
  return /XF86|Caps_Lock|Num_Lock|Scroll_Lock/i.test(String(keys || ""))
}

function isSheetBind(label) {
  return /shortcut sheet/i.test(String(label || ""))
}

function workspaceNumber(label, prefix) {
  var match = String(label || "").match(prefix)
  return match ? match[1] : ""
}

function collapseWorkspaces(items, labelRe, keysPattern, collapsedLabel) {
  var numbers = {}
  var rest = []
  for (var i = 0; i < items.length; i++) {
    var num = workspaceNumber(items[i].label, labelRe)
    if (num) numbers[num] = true
    else rest.push(items[i])
  }
  var count = 0
  for (var n in numbers) count++
  if (count >= 8) {
    rest.unshift({
      keys: keysPattern,
      label: collapsedLabel,
      kind: "desktop",
      dispatcher: "",
      arg: ""
    })
  }
  return rest
}

function copyBind(bind, kind) {
  return {
    keys: bind.keys,
    label: bind.label,
    kind: kind || "desktop",
    dispatcher: bind.dispatcher || "",
    arg: bind.arg || ""
  }
}

function matchesAny(label, patterns) {
  var text = String(label || "")
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(text)) return true
  }
  return false
}

var WINDOW_PATTERNS = [
  /^Close window$/,
  /^Full screen$/,
  /^Full width$/,
  /floating\/tiling/i,
  /^Toggle window split$/,
  /^Pop window/,
  /^Toggle scratchpad$/,
  /^Move window to scratchpad$/,
  /^Focus on (left|right|above|below)/i,
  /^Swap window/,
  /^Toggle window transparency$/,
  /^Toggle window gaps$/,
  /^Next workspace$/,
  /^Previous workspace$/,
  /^Former workspace$/,
  /^Switch to workspace /,
  /^Move window to workspace /,
  /^Universal (copy|paste|cut)$/,
  /^Select all$/
]

var LAUNCH_PATTERNS = [
  /^Terminal$/,
  /^Browser$/,
  /^File manager$/,
  /^Editor$/,
  /^Typora$/,
  /^Gmail$/,
  /^GitHub$/,
  /^Obsidian$/,
  /^ChatGPT$/,
  /^Grok$/,
  /^Email$/,
  /^Music$/,
  /^YouTube$/,
  /^X$/,
  /^Passwords$/,
  /^Omawrite$/,
  /^Agent$/,
  /^Docker$/,
  /^Tmux$/,
  /^Omarchy menu$/,
  /^Apps menu$/
]

var SYSTEM_PATTERNS = [
  /^System menu$/,
  /^Lock system$/,
  /^Screenshot$/,
  /^Screenrecording$/,
  /^Clipboard manager$/,
  /^Emojis$/,
  /^Color picker$/,
  /^Keybindings$/,
  /^Theme menu$/,
  /^Toggle nightlight$/,
  /^Toggle top bar$/,
  /^Capture menu$/,
  /^Notifications?$/i
]

function pickBinds(binds, patterns, limit) {
  var out = []
  var seen = {}
  for (var i = 0; i < binds.length; i++) {
    var bind = binds[i]
    if (!matchesAny(bind.label, patterns)) continue
    if (seen[bind.label]) continue
    seen[bind.label] = true
    out.push(copyBind(bind, "desktop"))
    if (out.length >= limit) break
  }
  return out
}

function group(name, items) {
  if (!items || items.length === 0) return null
  return { name: name, items: items }
}

function buildGroups(payload) {
  var data = payload && payload.binds ? payload : parsePayload(payload)
  var ctx = Catalog.context(data.window || {})
  var usable = []
  var binds = data.binds || []
  for (var i = 0; i < binds.length; i++) {
    var bind = binds[i]
    if (isMouse(bind.keys) || isMediaKey(bind.keys) || isSheetBind(bind.label)) continue
    usable.push(bind)
  }

  var windowItems = pickBinds(usable, WINDOW_PATTERNS, 20)
  windowItems = collapseWorkspaces(windowItems, /^Switch to workspace (\d+)$/, "SUPER + 1…0", "Switch workspace")
  windowItems = collapseWorkspaces(windowItems, /^Move window to workspace (\d+)$/, "SUPER SHIFT + 1…0", "Move window to workspace")

  var launchItems = pickBinds(usable, LAUNCH_PATTERNS, 14)
  var systemItems = pickBinds(usable, SYSTEM_PATTERNS, 12)

  var groups = []
  if (ctx.page) groups.push(group(ctx.page.name, ctx.page.items))
  if (ctx.app) groups.push(group(ctx.app.name, ctx.app.items))
  groups.push(group("Window", windowItems))
  groups.push(group("Launch", launchItems))
  if (groups.length < 4) groups.push(group("System", systemItems))

  var compact = []
  for (var g = 0; g < groups.length; g++) {
    if (groups[g]) compact.push(groups[g])
  }
  if (compact.length > 4) compact = compact.slice(0, 4)

  return {
    appName: ctx.page ? ctx.page.name : (ctx.app ? ctx.app.name : ctx.appName),
    contextLabel: ctx.page && ctx.appName !== ctx.page.name ? ctx.appName : "",
    title: ctx.title,
    groups: compact
  }
}

function filterGroups(groups, query) {
  var needle = String(query || "").toLowerCase().replace(/^\s+|\s+$/g, "")
  if (!needle) return groups
  var out = []
  for (var i = 0; i < groups.length; i++) {
    var items = []
    var list = groups[i].items || []
    for (var j = 0; j < list.length; j++) {
      var row = list[j]
      var hay = (row.keys + " " + row.label).toLowerCase()
      if (hay.indexOf(needle) !== -1) items.push(row)
    }
    if (items.length) out.push({ name: groups[i].name, items: items })
  }
  return out
}

function flatten(groups) {
  var rows = []
  for (var i = 0; i < (groups || []).length; i++) {
    var items = groups[i].items || []
    for (var j = 0; j < items.length; j++) {
      rows.push(items[j])
    }
  }
  return rows
}

function findByKeys(groups, keys) {
  var want = normalizeKeys(keys)
  if (!want) return null
  var rows = flatten(groups)
  for (var i = 0; i < rows.length; i++) {
    if (normalizeKeys(rows[i].keys) === want) return rows[i]
  }
  return null
}
