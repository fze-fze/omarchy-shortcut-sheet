import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import test from "node:test"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

async function loadScripts() {
  const catalogContext = vm.createContext({})
  vm.runInContext(await readFile(resolve(root, "Catalog.js"), "utf8"), catalogContext)

  const modelContext = vm.createContext({ Catalog: catalogContext })
  const modelSource = (await readFile(resolve(root, "Model.js"), "utf8"))
    .replace(/^\.import[^\n]*\n/, "")
  vm.runInContext(modelSource, modelContext)

  return { Catalog: catalogContext, Model: modelContext }
}

const { Catalog, Model } = await loadScripts()

test("recognizes browser page and app context", () => {
  const context = Catalog.context({
    class: "chrome-github.com__-Default",
    title: "Repository · GitHub",
    address: "0x123",
    tags: [],
  })

  assert.equal(context.page.name, "GitHub")
  assert.equal(context.app.name, "Browser")
  assert.ok(context.page.items.some((row) => row.label === "Go to issues"))
})

test("shows the installed ChatGPT desktop shortcuts, including Ctrl+B sidebar", () => {
  const context = Catalog.context({
    class: "chatgpt",
    title: "ChatGPT",
    address: "0x456",
    tags: [],
  })

  assert.equal(context.page.name, "ChatGPT")
  assert.ok(context.page.items.length >= 60)
  assert.ok(context.page.items.some((row) => row.keys === "Ctrl + B" && row.label === "Toggle sidebar"))
  assert.equal(context.page.items.some((row) => row.keys === "Ctrl + Shift + S" && row.label === "Toggle sidebar"), false)
  assert.equal(
    context.page.items.find((row) => row.keys === "Ctrl + `").arg,
    "CTRL,grave,address:0x456",
  )
  assert.equal(context.page.items.find((row) => row.keys === "Mouse Back").dispatcher, "")
})

test("keeps literal slash shortcuts runnable but rejects alternatives", () => {
  assert.equal(Catalog.canSend("/"), true)
  assert.equal(Catalog.canSend("Ctrl + /"), true)
  assert.equal(Catalog.canSend("j / k"), false)
  assert.equal(Catalog.canSend("G then I"), false)
})

test("keyboard navigation moves by rows and columns without wrapping", () => {
  const groups = [
    { name: "One", items: [{}, {}, {}] },
    { name: "Two", items: [{}, {}] },
    { name: "Three", items: [{}, {}, {}, {}] },
  ]

  assert.equal(Model.selectionAfterMove(groups, 0, 0, -1, true), 0)
  assert.equal(Model.selectionAfterMove(groups, 2, 0, 1, true), 2)
  assert.equal(Model.selectionAfterMove(groups, 1, 1, 0, true), 4)
  assert.equal(Model.selectionAfterMove(groups, 4, 1, 0, true), 6)
  assert.equal(Model.selectionAfterMove(groups, 6, -1, 0, true), 4)
  assert.equal(Model.selectionAfterMove(groups, 6, 0, 1, true), 7)
  assert.equal(Model.selectionAfterMove(groups, 5, -1, 0, true), 3)
  assert.equal(Model.selectionAfterMove(groups, 5, 1, 0, false), 3)
  assert.equal(Model.selectionAfterMove(groups, 5, 0, 1, false), 1)
  assert.equal(Model.selectionAfterMove(groups, 5, -1, 0, false), 0)
  assert.equal(Model.selectionAfterMove(groups, 5, 0, -1, false), 0)
  assert.equal(Model.selectionAfterMove([], 0, 1, 0, false), 0)
})

test("builds and filters desktop groups from live bindings", () => {
  const sheet = Model.buildGroups({
    window: {},
    binds: [
      { keys: "SUPER + W", label: "Close window", dispatcher: "lua", arg: "hl.dsp.window.close()" },
      { keys: "SUPER + RETURN", label: "Terminal", dispatcher: "exec", arg: "omarchy-launch-terminal" },
      { keys: "PRINT", label: "Screenshot", dispatcher: "exec", arg: "omarchy-capture-screenshot" },
    ],
  })

  assert.deepEqual(Array.from(sheet.groups, (group) => group.name), ["Window", "Launch", "System"])
  assert.equal(Model.flatten(sheet.groups).length, 3)
  const filtered = Model.filterGroups(sheet.groups, "terminal")
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].items[0].label, "Terminal")
})

test("keeps every scanned desktop binding, including mouse, media, workspace, and custom rows", () => {
  const binds = [
    { keys: "SUPER + 1", label: "Switch to workspace 1", dispatcher: "lua", arg: "workspace 1" },
    { keys: "SUPER + 2", label: "Switch to workspace 2", dispatcher: "lua", arg: "workspace 2" },
    { keys: "SUPER + LEFT MOUSE BUTTON", label: "Move window", dispatcher: "lua", arg: "movewindow" },
    { keys: "XF86AudioMute", label: "Mute", dispatcher: "exec", arg: "mute" },
    { keys: "SUPER + Z", label: "My custom command", dispatcher: "exec", arg: "custom" },
    { keys: "SUPER + Super_L", label: "Shortcut sheet", dispatcher: "exec", arg: "sheet" },
  ]
  const sheet = Model.buildGroups({ window: {}, binds })
  const desktopRows = Model.flatten(sheet.groups).filter((row) => row.kind === "desktop")

  assert.equal(sheet.scannedCount, binds.length)
  assert.equal(desktopRows.length, binds.length)
  assert.deepEqual(Array.from(desktopRows, (row) => row.label).sort(), Array.from(binds, (row) => row.label).sort())
  assert.equal(sheet.groups.some((group) => group.name === "Workspace"), true)
  assert.equal(sheet.groups.some((group) => group.name === "Hardware"), true)
  assert.equal(sheet.groups.some((group) => group.name === "Other"), true)
})

test("ships English-only interface copy", async () => {
  const sources = await Promise.all([
    "Overlay.qml",
    "Catalog.js",
    "Model.js",
  ].map((name) => readFile(resolve(root, name), "utf8")))

  assert.equal(sources.some((source) => /\p{Script=Han}/u.test(source)), false)
})

test("keeps long shortcut groups scrollable and keyboard selection visible", async () => {
  const source = await readFile(resolve(root, "Overlay.qml"), "utf8")

  assert.match(source, /ListView\s*{\s*id:\s*itemList/)
  assert.match(source, /Flickable\s*{\s*id:\s*groupFlick/)
  assert.match(source, /ScrollBar\.horizontal:\s*ScrollBar/)
  assert.match(source, /ScrollBar\.vertical:\s*ScrollBar/)
  assert.match(source, /interactive:\s*contentHeight\s*>\s*height/)
  assert.match(source, /positionViewAtIndex\(localIndex,\s*ListView\.Contain\)/)
  assert.match(source, /function\s+ensureSelectionVisible\(\)/)
  assert.match(source, /onSelectionRevisionChanged\(\)/)
  assert.match(source, /Qt\.Key_Left/)
  assert.match(source, /Qt\.Key_Right/)
  assert.match(source, /selectMove\(-1,\s*0\)/)
  assert.match(source, /selectMove\(1,\s*0\)/)
})

test("bounds collected records and renders all QML text as plain text", async () => {
  const [collector, overlay] = await Promise.all([
    readFile(resolve(root, "collect"), "utf8"),
    readFile(resolve(root, "Overlay.qml"), "utf8"),
  ])

  assert.match(collector, /MAX_RECORD_BYTES\s*=/)
  assert.match(collector, /MAX_RECORD_ROWS\s*=/)
  assert.match(collector, /MAX_LABEL_CHARS\s*=/)
  assert.match(collector, /ALLOWED_DISPATCHERS\s*=/)
  assert.match(collector, /path\.stat\(\)\.st_size\s*>\s*MAX_RECORD_BYTES/)

  const textElements = overlay.match(/\bText\s*{/g) || []
  const plainTextFormats = overlay.match(/textFormat:\s*Text\.PlainText/g) || []
  assert.equal(plainTextFormats.length, textElements.length)
})
