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

function isMediaKey(keys) {
  return /XF86|Caps_Lock|Num_Lock|Scroll_Lock/i.test(String(keys || ""))
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
  /window/i,
  /^Full (screen|width)$/,
  /^Universal (copy|paste|cut)$/,
  /^Select all$/,
  /scratchpad/i,
  /workspace layout/i,
  /zoom/i
]

var LAUNCH_PATTERNS = [
  /^(Terminal|Browser|File manager)( \(.+\))?$/,
  /^(Editor|Typora|Gmail|GitHub|Obsidian|ChatGPT|Grok|Email|New email)$/,
  /^(Music|Music TUI|YouTube|X|X Post|Passwords|Omawrite|Agent|Docker|Tmux|Herdr)$/,
  /^(Google Maps|WhatsApp|Google Messages|New blog article)$/
]

var SYSTEM_PATTERNS = [
  /menu/i,
  /lock/i,
  /notification/i,
  /screenshot|screenrecord|capture|color picker|clipboard|emojis|keybindings|OCR/i,
  /dictation|translate|reminder|share|activity|calendar|time|weather|transcode/i,
  /top bar|bar panel|background switcher|Omarchy Plugins/i
]

var HARDWARE_PATTERNS = [
  /audio|volume|microphone|media|track/i,
  /brightness|backlight|display|monitor scaling/i,
  /battery|bluetooth|network|power|touchpad|webcam|eject/i
]

var WORKSPACE_PATTERNS = [
  /workspace/i,
  /monitor/i
]

var DESKTOP_GROUP_ORDER = ["Window", "Launch", "System", "Workspace", "Hardware", "Other"]

function desktopGroupName(bind) {
  var label = String(bind.label || "")
  if (isMediaKey(bind.keys) || matchesAny(label, HARDWARE_PATTERNS)) return "Hardware"
  if (matchesAny(label, WORKSPACE_PATTERNS)) return "Workspace"
  if (matchesAny(label, WINDOW_PATTERNS)) return "Window"
  if (matchesAny(label, LAUNCH_PATTERNS)) return "Launch"
  if (matchesAny(label, SYSTEM_PATTERNS)) return "System"
  return "Other"
}

function desktopGroups(binds) {
  var buckets = {}
  for (var n = 0; n < DESKTOP_GROUP_ORDER.length; n++)
    buckets[DESKTOP_GROUP_ORDER[n]] = []

  for (var i = 0; i < binds.length; i++) {
    var bind = binds[i]
    buckets[desktopGroupName(bind)].push(copyBind(bind, "desktop"))
  }

  var out = []
  for (var g = 0; g < DESKTOP_GROUP_ORDER.length; g++) {
    var name = DESKTOP_GROUP_ORDER[g]
    var entry = group(name, buckets[name])
    if (entry) out.push(entry)
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
  var binds = data.binds || []

  var groups = []
  if (ctx.page) groups.push(group(ctx.page.name, ctx.page.items))
  if (ctx.app) groups.push(group(ctx.app.name, ctx.app.items))
  groups = groups.concat(desktopGroups(binds))

  var compact = []
  for (var g = 0; g < groups.length; g++) {
    if (groups[g]) compact.push(groups[g])
  }
  return {
    appName: ctx.page ? ctx.page.name : (ctx.app ? ctx.app.name : ctx.appName),
    contextLabel: ctx.page && ctx.appName !== ctx.page.name ? ctx.appName : "",
    title: ctx.title,
    scannedCount: binds.length,
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

function selectionAfterDelta(index, delta, length, cursorActive) {
  if (length <= 0) return 0
  if (!cursorActive) return 0
  return Math.max(0, Math.min(length - 1, index + delta))
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
