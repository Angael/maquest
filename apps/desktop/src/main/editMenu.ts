/**
 * The native right-click menu for text, links and images: whatever the renderer did not claim with its own menu
 * (Maquest's menus call preventDefault, so Electron never reports those). Pure, so it is unit tested without Electron.
 */

/** The part of Electron's ContextMenuParams the menu reads. */
export type EditParams = {
  isEditable: boolean
  selectionText: string
  misspelledWord: string
  dictionarySuggestions: string[]
  editFlags: { canUndo: boolean; canRedo: boolean; canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean }
  linkURL: string
  mediaType: string
  srcURL: string
}

export type EditAction =
  | 'replace'
  | 'learn'
  | 'spellcheck'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'search'
  | 'openLink'
  | 'copyLink'
  | 'viewImage'
  | 'copyImage'
  | 'revealImage'

export type EditItem =
  | { type: 'item'; label: string; action: EditAction; arg?: string; accelerator?: string; enabled?: boolean }
  | { type: 'checkbox'; label: string; action: EditAction; checked: boolean }
  | { type: 'separator' }

const SUGGESTIONS = 5
/** Longest selection offered to "Search project for …" (shown shortened in the label). */
const SEARCH_MAX = 200
const MEDIA = 'maquest-media:'

const quote = (text: string, max = 24) => {
  const t = text.replaceAll(/\s+/g, ' ').trim()
  return `“${t.length > max ? `${t.slice(0, max - 1)}…` : t}”`
}

/** Groups separated by one separator each; empty groups are dropped. */
function join(groups: EditItem[][]): EditItem[] {
  return groups.filter((g) => g.length).flatMap((g, i) => (i ? [{ type: 'separator' as const }, ...g] : g))
}

export function editMenu(p: EditParams, opts: { spellcheck: boolean }): EditItem[] {
  const selection = p.selectionText.trim()
  const groups: EditItem[][] = []

  if (p.isEditable && p.misspelledWord) {
    const suggestions = p.dictionarySuggestions.slice(0, SUGGESTIONS)
    groups.push([
      ...(suggestions.length
        ? suggestions.map((word): EditItem => ({ type: 'item', label: word, action: 'replace', arg: word }))
        : [{ type: 'item' as const, label: 'No spelling suggestions', action: 'replace' as const, enabled: false }]),
      { type: 'item', label: 'Add to dictionary', action: 'learn', arg: p.misspelledWord },
    ])
  }

  if (/^(https?|mailto):/i.test(p.linkURL))
    groups.push([
      { type: 'item', label: 'Open link', action: 'openLink', arg: p.linkURL },
      { type: 'item', label: p.linkURL.startsWith('mailto:') ? 'Copy email address' : 'Copy link address', action: 'copyLink', arg: p.linkURL },
    ])

  if (p.mediaType === 'image' && p.srcURL) {
    const own = p.srcURL.startsWith(MEDIA)
    groups.push([
      ...(own ? [{ type: 'item' as const, label: 'View full size', action: 'viewImage' as const, arg: p.srcURL }] : []),
      { type: 'item', label: 'Copy image', action: 'copyImage' },
      ...(own ? [{ type: 'item' as const, label: 'Show in folder', action: 'revealImage' as const, arg: p.srcURL }] : []),
    ])
  }

  if (p.isEditable) {
    const f = p.editFlags
    groups.push([
      { type: 'item', label: 'Undo', action: 'undo', accelerator: 'CmdOrCtrl+Z', enabled: f.canUndo },
      { type: 'item', label: 'Redo', action: 'redo', accelerator: 'CmdOrCtrl+Shift+Z', enabled: f.canRedo },
    ])
    groups.push([
      { type: 'item', label: 'Cut', action: 'cut', accelerator: 'CmdOrCtrl+X', enabled: f.canCut },
      { type: 'item', label: 'Copy', action: 'copy', accelerator: 'CmdOrCtrl+C', enabled: f.canCopy },
      { type: 'item', label: 'Paste', action: 'paste', accelerator: 'CmdOrCtrl+V', enabled: f.canPaste },
    ])
    groups.push([{ type: 'item', label: 'Select all', action: 'selectAll', accelerator: 'CmdOrCtrl+A', enabled: f.canSelectAll }])
  } else if (selection) {
    groups.push([{ type: 'item', label: 'Copy', action: 'copy', accelerator: 'CmdOrCtrl+C', enabled: p.editFlags.canCopy }])
  }

  if (selection && !selection.includes('\n'))
    groups.push([{ type: 'item', label: `Search project for ${quote(selection)}`, action: 'search', arg: selection.slice(0, SEARCH_MAX) }])

  if (p.isEditable) groups.push([{ type: 'checkbox', label: 'Check spelling while typing', action: 'spellcheck', checked: opts.spellcheck }])

  return join(groups)
}

/** Project-relative path of a `maquest-media://p/<path>` URL. */
export function mediaRel(url: string) {
  return decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '')
}
