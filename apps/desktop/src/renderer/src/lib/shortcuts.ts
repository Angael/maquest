const mac = window.maquest.platform === 'darwin'
/** Modifier key label for shortcut hints. */
export const MOD = mac ? '⌘' : 'Ctrl'

export type ShortcutGroup = { group: string; items: [label: string, keys: string][] }

/** Every keyboard shortcut, by area: the reference dialog (Ctrl+/) lists them all, the canvas popover its own. */
export const SHORTCUTS = {
  general: [
    {
      group: 'General',
      items: [
        ['Search and commands', `${MOD}+K`],
        ['Keyboard shortcuts', `${MOD}+/`],
        ['Switch view', `${MOD}+1…5`],
        ['Toggle sidebar', `${MOD}+B`],
        ['Live notes', `${MOD}+J`],
        ['Open folder', `${MOD}+O`],
        ['Undo', `${MOD}+Z`],
        ['Redo', `${MOD}+Shift+Z`],
      ],
    },
    {
      group: 'Inspector',
      items: [
        ['Back', mac ? '⌘+[' : 'Alt+←'],
        ['Forward', mac ? '⌘+]' : 'Alt+→'],
        ['Open in a new tab', 'Middle-click'],
        ['Delete node', 'Del'],
        ['Close', 'Esc'],
      ],
    },
    {
      group: 'Writing',
      items: [
        ['Find in document', `${MOD}+F`],
        ['Link a node', '[['],
        ['Spelling suggestions', 'Right-click'],
      ],
    },
    {
      group: 'Backlog',
      items: [
        ['Add idea', 'Enter'],
        ['Add details', 'Shift+Enter'],
        ['Add idea with details', `${MOD}+Enter`],
      ],
    },
  ] satisfies ShortcutGroup[],
  canvas: [
    {
      group: 'Cards',
      items: [
        ['Add a card at the pointer', 'A'],
        ['Copy reference', `${MOD}+C`],
        ['Paste reference', `${MOD}+V`],
        ['Duplicate', `${MOD}+D`],
        ['Group selection', `${MOD}+G`],
        ['Select all', `${MOD}+A`],
        ['Remove from board', 'Del'],
        ['Delete everywhere', 'Shift+Del'],
      ],
    },
    {
      group: 'Canvas',
      items: [
        ['Undo', `${MOD}+Z`],
        ['Redo', `${MOD}+Shift+Z`],
        ['Add to selection', 'Shift+Click'],
        ['Open in a new tab', 'Middle-click'],
        ['Pan', 'Middle-drag'],
      ],
    },
  ] satisfies ShortcutGroup[],
}
