import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

type Params = Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'misspelledWord' | 'dictionarySuggestions' | 'editFlags'>
export type EditMenuActions = { replace: (word: string) => void; learn: (word: string) => void }

/**
 * The native right-click menu for text: spelling suggestions and "Add to dictionary" on a misspelled word, then
 * Cut/Copy/Paste/Select all in editable fields, or Copy for selected text elsewhere. Empty when the app shows its own
 * menu (canvas, tabs…) or nothing applies.
 */
export function editMenuTemplate(params: Params, actions: EditMenuActions): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  if (params.isEditable && params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, 5)
    for (const word of suggestions) items.push({ label: word, click: () => actions.replace(word) })
    if (!suggestions.length) items.push({ label: 'No suggestions', enabled: false })
    items.push({ type: 'separator' }, { label: 'Add to dictionary', click: () => actions.learn(params.misspelledWord) }, { type: 'separator' })
  }
  if (params.isEditable) {
    const f = params.editFlags
    items.push(
      { role: 'undo', enabled: f.canUndo },
      { role: 'redo', enabled: f.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: f.canCut },
      { role: 'copy', enabled: f.canCopy },
      { role: 'paste', enabled: f.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: f.canSelectAll },
    )
  } else if (params.selectionText.trim()) items.push({ role: 'copy' })
  return items
}
