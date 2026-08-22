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

test("keeps literal slash shortcuts runnable but rejects alternatives", () => {
  assert.equal(Catalog.canSend("/"), true)
  assert.equal(Catalog.canSend("Ctrl + /"), true)
  assert.equal(Catalog.canSend("j / k"), false)
  assert.equal(Catalog.canSend("G then I"), false)
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
})
