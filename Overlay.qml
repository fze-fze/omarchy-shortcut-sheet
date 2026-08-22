import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "Model.js" as Model

Item {
  id: root

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null

  property bool opened: false
  property string filterText: ""
  property int selectedIndex: 0
  property bool cursorActive: false
  property var sheet: ({ appName: "", contextLabel: "", title: "", groups: [] })
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
  property string footerText: "Tap Super to open  ·  Esc to close"
  property int contentSpacing: Style.spacing.lg
  property int columnGap: Style.spacing.xxl
  property int columnWidth: Style.space(280)
  property int rowHeight: Math.max(Style.space(28), Style.font.body + Style.spacing.md)
  readonly property int groupCount: Math.max(1, visibleGroups.length)
  readonly property int maxRows: {
    var max = 1
    for (var i = 0; i < root.visibleGroups.length; i++) {
      var n = (root.visibleGroups[i].items || []).length
      if (n > max) max = n
    }
    return max
  }
  property int cardWidth: Math.min(panel.width - Style.gapsOut * 2, root.columnWidth * root.groupCount + root.columnGap * Math.max(0, root.groupCount - 1) + root.contentMargin * 2 + Style.space(8))
  readonly property int maxCardHeight: Math.max(Style.space(240), panel.height - Style.gapsOut * 2)
  property int cardHeight: Math.min(root.maxCardHeight, root.headerHeight + root.footerBlockHeight + root.contentSpacing * 2 + Style.font.caption + Style.spacing.sm + root.rowHeight * root.maxRows + root.contentMargin * 2 + Style.space(20))
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
    return bits.length ? bits.join("  ·  ") : "Shortcuts for this screen"
  }

  function open(payloadJson) {
    root.opened = true
    root.filterText = ""
    root.selectedIndex = 0
    root.cursorActive = false
    root.keyFocus = WlrKeyboardFocus.Exclusive
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
    root.visibleGroups = Model.filterGroups(root.sheet.groups || [], root.filterText)
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
    root.rebuildVisible()
  }

  function selectDelta(delta) {
    if (root.flatItems.length === 0) return
    if (!root.cursorActive) {
      root.cursorActive = true
      root.selectedIndex = delta < 0 ? root.flatItems.length - 1 : 0
      return
    }
    var next = root.selectedIndex + delta
    if (next < 0) next = root.flatItems.length - 1
    if (next >= root.flatItems.length) next = 0
    root.selectedIndex = next
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
            if (root.filterText) root.setFilter("")
            else root.dismiss()
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Up) {
            root.selectDelta(-1)
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Down) {
            root.selectDelta(1)
            event.accepted = true
            return
          }
          if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            if (root.cursorActive) root.runIndex(root.selectedIndex)
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

        Item {
          width: parent.width
          height: root.headerHeight

          Text {
            id: titleLabel
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            text: root.headerTitle
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
            font.bold: true
            elide: Text.ElideRight
          }

          Text {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: titleLabel.bottom
            anchors.topMargin: Style.space(2)
            text: root.headerHint
            color: root.foreground
            opacity: 0.58
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }
        }

        Row {
          width: parent.width
          height: Math.max(1, cardInner.height - root.headerHeight - root.contentSpacing)
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
                var rowTop = localIndex * (root.rowHeight + Style.spacing.sm)
                var rowBottom = rowTop + root.rowHeight
                if (rowTop < itemFlick.contentY)
                  itemFlick.contentY = rowTop
                else if (rowBottom > itemFlick.contentY + itemFlick.height)
                  itemFlick.contentY = Math.min(
                    Math.max(0, itemFlick.contentHeight - itemFlick.height),
                    rowBottom - itemFlick.height
                  )
              }

              Connections {
                target: root
                function onSelectedIndexChanged() {
                  columnRoot.ensureSelectionVisible()
                }
              }

              width: Math.max(1, Math.floor((parent.width - root.columnGap * Math.max(0, groupModel.count - 1)) / Math.max(1, groupModel.count)))
              height: parent.height

              Text {
                id: groupTitle
                width: parent.width
                text: columnRoot.name.toUpperCase()
                color: root.foreground
                opacity: 0.5
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1.1
              }

              Flickable {
                id: itemFlick
                anchors.top: groupTitle.bottom
                anchors.topMargin: Style.spacing.sm
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                contentWidth: width
                contentHeight: itemColumn.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                flickableDirection: Flickable.VerticalFlick
                interactive: contentHeight > height
                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                Column {
                  id: itemColumn
                  width: itemFlick.width
                  spacing: Style.spacing.sm

                  Repeater {
                    model: columnRoot.items

                    delegate: Item {
                      id: rowRoot
                      required property var modelData
                      required property int index
                      readonly property int flatIndex: columnRoot.startIndex + index
                      readonly property bool hasCursor: root.cursorActive && rowRoot.flatIndex === root.selectedIndex
                      readonly property var parts: Model.keyParts(modelData.keys)

                      width: itemColumn.width
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
