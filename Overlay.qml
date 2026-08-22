import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import qs.Ui as Ui
import "Model.js" as Model

Item {
  id: root

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null

  property bool opened: false
  property string filterText: ""
  property int selectedIndex: 0
  property int selectionRevision: 0
  property bool cursorActive: false
  property bool keyboardNavigationActive: false
  property bool settingsOpen: false
  property bool settingsButtonActive: false
  property int columnCount: 3
  readonly property var desktopGroupNames: ["Window", "Launch", "System", "Workspace", "Hardware", "Other"]
  property var desktopGroupVisibility: ({
    "Window": true,
    "Launch": true,
    "System": true,
    "Workspace": true,
    "Hardware": true,
    "Other": true
  })
  property var sheet: ({ appName: "", contextLabel: "", title: "", scannedCount: 0, groups: [] })
  property var visibleGroups: []

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  readonly property int cornerRadius: Style.cornerRadius
  property string fontFamily: Style.font.menuFamily
  property int contentMargin: Style.spacing.panelPadding
  property int headerHeight: Math.max(Style.space(42), Style.font.heading + Style.font.caption + Style.spacing.md)
  property int footerHeight: Math.max(Style.space(24), Style.font.body + Style.spacing.sm)
  property int footerBlockHeight: 1 + Style.spacing.sm + footerHeight
  property string footerText: "← → categories  ·  ↑ ↓ shortcuts  ·  Type to search  ·  Esc to close"
  property int contentSpacing: Style.spacing.lg
  property int columnGap: Style.spacing.xxl
  property int columnWidth: Style.space(280)
  property int rowHeight: Math.max(Style.space(28), Style.font.body + Style.spacing.md)
  property int cardWidth: Math.min(panel.width - Style.gapsOut * 2, root.columnWidth * root.columnCount + root.columnGap * (root.columnCount - 1) + root.contentMargin * 2 + Style.space(8))
  readonly property int maxCardHeight: Math.max(Style.space(240), panel.height - Style.gapsOut * 2)
  property int cardHeight: Math.min(root.maxCardHeight, Math.max(Style.space(420), Math.round(panel.height * 0.72)))
  property int keyFocus: WlrKeyboardFocus.None

  readonly property string pluginDir: (root.manifest && root.manifest.__sourceDir)
    ? root.manifest.__sourceDir
    : (Quickshell.env("HOME") + "/.config/omarchy/plugins/io.github.fze-fze.shortcut-sheet")
  readonly property string selfId: (root.manifest && root.manifest.id) || "io.github.fze-fze.shortcut-sheet"
  readonly property var flatItems: Model.flatten(root.visibleGroups)
  readonly property string headerTitle: root.sheet.appName || "Desktop"
  readonly property string headerHint: {
    if (root.filterText) return "Filter: " + root.filterText
    var bits = []
    if (root.sheet.contextLabel) bits.push(root.sheet.contextLabel)
    if (root.sheet.title) bits.push(root.sheet.title)
    if (root.sheet.scannedCount) bits.push(root.sheet.scannedCount + " live shortcuts")
    return bits.length ? bits.join("  ·  ") : "Shortcuts for this screen"
  }

  function open(payloadJson) {
    root.opened = true
    root.filterText = ""
    root.selectedIndex = 0
    root.cursorActive = false
    root.keyboardNavigationActive = false
    root.settingsOpen = false
    root.settingsButtonActive = false
    root.keyFocus = WlrKeyboardFocus.Exclusive
    root.loadPreferences()
    root.refresh()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() {
    runTimer.stop()
    root.opened = false
    root.keyFocus = WlrKeyboardFocus.None
  }

  function dismiss() {
    root.close()
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide(root.selfId)
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  function refresh() {
    if (collectProc.running) collectProc.running = false
    collectProc.running = true
  }

  function applyPayload(raw) {
    root.sheet = Model.buildGroups(Model.parsePayload(raw))
    root.rebuildVisible()
  }

  function rebuildVisible() {
    root.visibleGroups = Model.applyGroupVisibility(
      Model.filterGroups(root.sheet.groups || [], root.filterText),
      root.desktopGroupVisibility
    )
    groupModel.clear()
    for (var i = 0; i < root.visibleGroups.length; i++) {
      groupModel.append({
        name: root.visibleGroups[i].name,
        itemsJson: JSON.stringify(root.visibleGroups[i].items || [])
      })
    }
    if (root.selectedIndex >= root.flatItems.length)
      root.selectedIndex = Math.max(0, root.flatItems.length - 1)
  }

  function setFilter(nextFilter) {
    root.filterText = nextFilter
    root.selectedIndex = 0
    root.cursorActive = true
    root.settingsButtonActive = false
    root.rebuildVisible()
  }

  function pluginSettings() {
    if (!root.shell || !root.shell.shellConfig) return ({})
    var plugins = root.shell.shellConfig.plugins || []
    for (var i = 0; i < plugins.length; i++) {
      if (plugins[i] && String(plugins[i].id || "") === root.selfId)
        return plugins[i]
    }
    return ({})
  }

  function loadPreferences() {
    var settings = root.pluginSettings()
    var hidden = settings.hiddenGroups instanceof Array ? settings.hiddenGroups : []
    root.columnCount = Number(settings.columnCount) === 4 ? 4 : 3
    var next = ({})
    for (var i = 0; i < root.desktopGroupNames.length; i++) {
      var name = root.desktopGroupNames[i]
      next[name] = hidden.indexOf(name) === -1
    }
    root.desktopGroupVisibility = next
  }

  function persistPreferences() {
    if (!root.shell || typeof root.shell.updateEntryInline !== "function") return
    var hidden = []
    for (var i = 0; i < root.desktopGroupNames.length; i++) {
      var name = root.desktopGroupNames[i]
      if (root.desktopGroupVisibility[name] === false) hidden.push(name)
    }
    root.shell.updateEntryInline(root.selfId, {
      hiddenGroups: hidden,
      columnCount: root.columnCount
    })
  }

  function setColumnCount(value) {
    var next = Number(value) === 4 ? 4 : 3
    if (root.columnCount === next) return
    root.columnCount = next
    root.selectionRevision += 1
    root.persistPreferences()
  }

  function toggleDesktopGroup(name) {
    if (root.desktopGroupNames.indexOf(name) === -1) return
    var next = ({})
    for (var i = 0; i < root.desktopGroupNames.length; i++) {
      var groupName = root.desktopGroupNames[i]
      next[groupName] = root.desktopGroupVisibility[groupName] !== false
    }
    next[name] = !next[name]
    root.desktopGroupVisibility = next
    root.selectedIndex = 0
    root.cursorActive = false
    root.keyboardNavigationActive = false
    root.rebuildVisible()
    root.persistPreferences()
  }

  function selectMove(columnDelta, rowDelta) {
    if (root.flatItems.length === 0) return
    root.keyboardNavigationActive = true

    if (root.settingsButtonActive) {
      if (columnDelta < 0) {
        root.settingsButtonActive = false
        root.cursorActive = true
        root.selectionRevision += 1
      }
      return
    }

    if (columnDelta > 0) {
      var position = Model.selectionPosition(
        root.visibleGroups,
        root.cursorActive ? root.selectedIndex : 0
      )
      if (position.groupIndex === root.visibleGroups.length - 1) {
        root.settingsButtonActive = true
        root.cursorActive = false
        return
      }
    }

    root.settingsButtonActive = false
    root.selectedIndex = Model.selectionAfterMove(
      root.visibleGroups,
      root.selectedIndex,
      columnDelta,
      rowDelta,
      root.cursorActive
    )
    root.cursorActive = true
    root.selectionRevision += 1
  }

  function runIndex(index) {
    if (index < 0 || index >= root.flatItems.length) return
    root.runItem(root.flatItems[index])
  }

  function runItem(item) {
    if (!item) return
    pendingRun.dispatcher = item.dispatcher || ""
    pendingRun.arg = item.arg || ""
    root.dismiss()
    if (pendingRun.dispatcher)
      runTimer.restart()
  }

  function eventKeys(event) {
    var mods = []
    if (event.modifiers & Qt.MetaModifier) mods.push("SUPER")
    if (event.modifiers & Qt.ControlModifier) mods.push("CTRL")
    if (event.modifiers & Qt.AltModifier) mods.push("ALT")
    if (event.modifiers & Qt.ShiftModifier) mods.push("SHIFT")
    var name = root.qtKeyName(event.key)
    if (!name) return ""
    if (mods.length) return mods.join(" ") + " + " + name
    return name
  }

  function qtKeyName(key) {
    if (key === Qt.Key_Return || key === Qt.Key_Enter) return "RETURN"
    if (key === Qt.Key_Escape) return "ESCAPE"
    if (key === Qt.Key_Space) return "SPACE"
    if (key === Qt.Key_Tab) return "TAB"
    if (key === Qt.Key_Backspace) return "BACKSPACE"
    if (key === Qt.Key_Delete) return "DELETE"
    if (key === Qt.Key_Home) return "HOME"
    if (key === Qt.Key_End) return "END"
    if (key === Qt.Key_PageUp) return "PAGEUP"
    if (key === Qt.Key_PageDown) return "PAGEDOWN"
    if (key === Qt.Key_Left) return "LEFT"
    if (key === Qt.Key_Right) return "RIGHT"
    if (key === Qt.Key_Up) return "UP"
    if (key === Qt.Key_Down) return "DOWN"
    if (key === Qt.Key_Comma) return "COMMA"
    if (key === Qt.Key_Period) return "PERIOD"
    if (key === Qt.Key_Minus) return "MINUS"
    if (key === Qt.Key_Equal) return "EQUAL"
    if (key === Qt.Key_Slash) return "SLASH"
    if (key >= Qt.Key_A && key <= Qt.Key_Z)
      return String.fromCharCode(key)
    if (key >= Qt.Key_0 && key <= Qt.Key_9)
      return String.fromCharCode(key)
    if (key >= Qt.Key_F1 && key <= Qt.Key_F12)
      return "F" + (key - Qt.Key_F1 + 1)
    return ""
  }

  QtObject {
    id: pendingRun
    property string dispatcher: ""
    property string arg: ""
  }

  Timer {
    id: runTimer
    interval: 80
    repeat: false
    onTriggered: {
      if (!pendingRun.dispatcher) return
      Quickshell.execDetached([root.pluginDir + "/run", pendingRun.dispatcher, pendingRun.arg])
      pendingRun.dispatcher = ""
      pendingRun.arg = ""
    }
  }

  Process {
    id: collectProc
    command: ["python3", root.pluginDir + "/collect"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyPayload(text)
    }
  }

  ListModel { id: groupModel }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "omarchy-shortcut-sheet"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: root.keyFocus
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: root.cardHeight
      radius: root.cornerRadius
      anchors.centerIn: parent
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin
      clip: true

      MouseArea { anchors.fill: parent; onClicked: {} }

      Item {
        id: keyCatcher
        anchors.fill: parent
        focus: true
        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) {
            if (root.settingsOpen) {
              root.settingsOpen = false
              root.settingsButtonActive = true
            }
            else if (root.filterText) root.setFilter("")
            else root.dismiss()
            event.accepted = true
            return
          }
          if (root.settingsOpen) {
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Up) {
            root.selectMove(0, -1)
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Down) {
            root.selectMove(0, 1)
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Left) {
            root.selectMove(-1, 0)
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Right) {
            root.selectMove(1, 0)
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            if (root.settingsButtonActive) root.settingsOpen = true
            else if (root.cursorActive) root.runIndex(root.selectedIndex)
            else if (root.flatItems.length > 0) {
              root.cursorActive = true
              root.selectedIndex = 0
            }
            event.accepted = true
            return
          }
          if (Util.editsFilter(event, root.filterText)) {
            root.setFilter(Util.editedFilter(event, root.filterText))
            event.accepted = true
            return
          }

          var combo = root.eventKeys(event)
          var chord = event.modifiers & (Qt.MetaModifier | Qt.ControlModifier | Qt.AltModifier)
          if (chord && combo) {
            var match = Model.findByKeys(root.visibleGroups, combo)
            if (match) {
              root.runItem(match)
              event.accepted = true
              return
            }
          }

          if (!chord && event.text && event.text.length === 1 && event.text.charCodeAt(0) >= 32 && event.text.charCodeAt(0) !== 127) {
            root.setFilter(root.filterText + event.text)
            event.accepted = true
          }
        }
      }

      MouseArea {
        anchors.fill: parent
        visible: root.settingsOpen
        z: 50
        onClicked: {
          root.settingsOpen = false
          root.settingsButtonActive = false
        }
        onWheel: function(wheel) { wheel.accepted = true }
      }

      PanelActionButton {
        id: settingsButton
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        z: 52
        iconText: "󰒓"
        tooltipText: "View settings"
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.subtitle
        size: root.headerHeight
        bordered: true
        hasCursor: root.settingsOpen || root.settingsButtonActive
        onClicked: {
          root.settingsButtonActive = false
          root.settingsOpen = !root.settingsOpen
        }
      }

      BorderSurface {
        id: settingsCard
        anchors.top: settingsButton.bottom
        anchors.right: settingsButton.right
        anchors.topMargin: Style.spacing.sm
        width: Math.min(card.width - root.contentMargin * 2, Style.space(384))
        height: Math.min(
          settingsContent.implicitHeight + contentTopInset + contentBottomInset,
          card.height - y - card.contentBottomInset
        )
        z: 51
        visible: opacity > 0
        enabled: root.settingsOpen
        opacity: root.settingsOpen ? 1 : 0
        radius: root.cornerRadius
        color: root.background
        borderSpec: root.borderSpec
        padding: Style.spacing.lg

        Behavior on opacity {
          NumberAnimation { duration: 100; easing.type: Easing.OutCubic }
        }

        MouseArea { anchors.fill: parent; onClicked: {} }

        Flickable {
          id: settingsFlick
          anchors.fill: parent
          anchors.topMargin: settingsCard.contentTopInset
          anchors.leftMargin: settingsCard.contentLeftInset
          anchors.rightMargin: settingsCard.contentRightInset
          anchors.bottomMargin: settingsCard.contentBottomInset
          contentWidth: width
          contentHeight: settingsContent.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          Column {
            id: settingsContent
            width: settingsFlick.width
            spacing: Style.spacing.lg

            Column {
              id: settingsHeader
              width: parent.width
              spacing: Style.spacing.xs

              Text {
                width: parent.width
                text: "View settings"
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
              }

              Text {
                width: parent.width
                text: "Current app and page shortcuts always stay visible."
                textFormat: Text.PlainText
                color: root.foreground
                opacity: 0.58
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.NoWrap
              }
            }

            Column {
              id: columnsSection
              width: parent.width
              spacing: Style.spacing.sm

              Text {
                width: parent.width
                text: "Columns"
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }

              Ui.ButtonGroup {
                options: ["3", "4"]
                value: String(root.columnCount)
                foreground: root.foreground
                background: root.background
                accent: Color.accent
                fontFamily: root.fontFamily
                onChanged: function(value) { root.setColumnCount(value) }
              }
            }

            Column {
              id: groupsSection
              width: parent.width
              spacing: Style.spacing.sm

              Text {
                width: parent.width
                text: "Groups"
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }

              Repeater {
                model: root.desktopGroupNames

                delegate: Toggle {
                  required property string modelData
                  width: groupsSection.width
                  label: modelData
                  checked: root.desktopGroupVisibility[modelData] !== false
                  foreground: root.foreground
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  onClicked: root.toggleDesktopGroup(modelData)
                }
              }
            }
          }
        }
      }

      Column {
        id: cardInner
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: footerBlock.top
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: root.contentSpacing
        anchors.leftMargin: card.contentLeftInset
        spacing: root.contentSpacing
        clip: true

        Item {
          width: parent.width
          height: root.headerHeight

          Text {
            id: titleLabel
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.rightMargin: settingsButton.width + Style.spacing.sm
            anchors.top: parent.top
            text: root.headerTitle
            textFormat: Text.PlainText
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
            font.bold: true
            elide: Text.ElideRight
          }

          Text {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.rightMargin: settingsButton.width + Style.spacing.sm
            anchors.top: titleLabel.bottom
            anchors.topMargin: Style.space(2)
            text: root.headerHint
            textFormat: Text.PlainText
            color: root.foreground
            opacity: 0.58
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }
        }

        Flickable {
          id: groupFlick
          width: parent.width
          height: Math.max(1, cardInner.height - root.headerHeight - root.contentSpacing)
          clip: true
          contentWidth: groupRow.width
          contentHeight: height
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.HorizontalFlick
          enabled: !root.settingsOpen
          interactive: enabled && contentWidth > width
          onEnabledChanged: if (!enabled) cancelFlick()
          ScrollBar.horizontal: ScrollBar { policy: ScrollBar.AsNeeded }

          Row {
            id: groupRow
            readonly property int visibleColumns: root.columnCount
            readonly property int itemWidth: Math.max(1, Math.floor((groupFlick.width - root.columnGap * Math.max(0, visibleColumns - 1)) / visibleColumns))
            width: itemWidth * groupModel.count + root.columnGap * Math.max(0, groupModel.count - 1)
            height: groupFlick.height
            spacing: root.columnGap

            Repeater {
              model: groupModel

              delegate: Item {
                id: columnRoot
                required property string name
                required property string itemsJson
                required property int index

              readonly property var items: {
                try { return JSON.parse(columnRoot.itemsJson) } catch (e) { return [] }
              }
              readonly property int startIndex: {
                var start = 0
                for (var i = 0; i < columnRoot.index; i++) {
                  try { start += JSON.parse(groupModel.get(i).itemsJson).length } catch (e) {}
                }
                return start
              }

                function ensureSelectionVisible() {
                  if (root.selectedIndex < columnRoot.startIndex
                      || root.selectedIndex >= columnRoot.startIndex + columnRoot.items.length)
                    return

                  var localIndex = root.selectedIndex - columnRoot.startIndex
                  itemList.positionViewAtIndex(localIndex, ListView.Contain)
                  if (columnRoot.x < groupFlick.contentX)
                    groupFlick.contentX = columnRoot.x
                  else if (columnRoot.x + columnRoot.width > groupFlick.contentX + groupFlick.width)
                    groupFlick.contentX = Math.min(
                      Math.max(0, groupFlick.contentWidth - groupFlick.width),
                      columnRoot.x + columnRoot.width - groupFlick.width
                    )
                }

              Connections {
                target: root
                function onSelectedIndexChanged() {
                  columnRoot.ensureSelectionVisible()
                }
                function onSelectionRevisionChanged() {
                  columnRoot.ensureSelectionVisible()
                }
              }

                width: groupRow.itemWidth
                height: groupRow.height

              Text {
                id: groupTitle
                width: parent.width
                text: columnRoot.name.toUpperCase()
                textFormat: Text.PlainText
                color: root.foreground
                opacity: 0.5
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1.1
              }

              ListView {
                id: itemList
                anchors.top: groupTitle.bottom
                anchors.topMargin: Style.spacing.sm
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                interactive: enabled && contentHeight > height
                onEnabledChanged: if (!enabled) cancelFlick()
                model: columnRoot.items
                spacing: Style.spacing.sm
                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                delegate: Item {
                      id: rowRoot
                      required property var modelData
                      required property int index
                      readonly property int flatIndex: columnRoot.startIndex + index
                      readonly property bool hasCursor: root.cursorActive && rowRoot.flatIndex === root.selectedIndex
                      readonly property var parts: Model.keyParts(modelData.keys)

                      width: itemList.width
                      height: root.rowHeight

                      Rectangle {
                        anchors.fill: parent
                        radius: Math.max(4, root.cornerRadius - 4)
                        color: rowRoot.hasCursor ? root.selectedBackground : "transparent"

                        Row {
                          anchors.left: parent.left
                          anchors.right: parent.right
                          anchors.verticalCenter: parent.verticalCenter
                          anchors.leftMargin: Style.space(4)
                          anchors.rightMargin: Style.space(4)
                          spacing: Style.spacing.md

                          Row {
                            id: keysRow
                            spacing: Style.space(4)
                            anchors.verticalCenter: parent.verticalCenter

                            Repeater {
                              model: rowRoot.parts
                              delegate: Rectangle {
                                required property string modelData
                                width: Math.max(Style.space(18), keyLabel.implicitWidth + Style.space(10))
                                height: Math.max(Style.space(18), Style.font.bodySmall + Style.space(6))
                                radius: 4
                                color: Util.alpha(root.foreground, 0.08)
                                border.width: 1
                                border.color: Util.alpha(root.foreground, 0.2)

                                Text {
                                  id: keyLabel
                                  anchors.centerIn: parent
                                  text: modelData
                                  textFormat: Text.PlainText
                                  color: rowRoot.hasCursor ? root.selectedText : root.foreground
                                  font.family: root.fontFamily
                                  font.pixelSize: Style.font.bodySmall
                                }
                              }
                            }
                          }

                          Text {
                            width: Math.max(10, parent.width - keysRow.width - parent.spacing)
                            text: rowRoot.modelData.label
                            textFormat: Text.PlainText
                            color: rowRoot.hasCursor ? root.selectedText : root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.body
                            elide: Text.ElideRight
                            anchors.verticalCenter: parent.verticalCenter
                          }
                        }

                        MouseArea {
                          anchors.fill: parent
                          hoverEnabled: true
                          cursorShape: Qt.PointingHandCursor
                          onEntered: {
                            if (root.keyboardNavigationActive) return
                            root.settingsButtonActive = false
                            root.cursorActive = true
                            root.selectedIndex = rowRoot.flatIndex
                          }
                          onPressed: {
                            root.keyboardNavigationActive = false
                            root.settingsButtonActive = false
                            root.cursorActive = true
                            root.selectedIndex = rowRoot.flatIndex
                          }
                          onClicked: root.runItem(rowRoot.modelData)
                        }
                      }
                }
              }
              }
            }
          }
        }

      }

      Item {
        id: footerBlock
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.leftMargin: card.contentLeftInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        height: root.footerBlockHeight

        Rectangle {
          width: parent.width
          height: 1
          color: root.foreground
          opacity: 0.18
        }

        Text {
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          height: root.footerHeight
          text: root.footerText
          textFormat: Text.PlainText
          color: root.foreground
          opacity: 0.9
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          horizontalAlignment: Text.AlignHCenter
          verticalAlignment: Text.AlignVCenter
        }
      }
    }
  }
}
