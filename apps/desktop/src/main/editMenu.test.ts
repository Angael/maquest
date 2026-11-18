import assert from 'node:assert/strict'
import test from 'node:test'
import { editMenuTemplate } from './editMenu'

const flags = { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canSelectAll: true, canDelete: true, canEditRichly: false }
const base = { isEditable: false, selectionText: '', misspelledWord: '', dictionarySuggestions: [] as string[], editFlags: flags }
const noop = { replace: () => {}, learn: () => {} }

test('editMenuTemplate is empty with nothing to edit or copy', () => {
  assert.deepEqual(editMenuTemplate(base, noop), [])
})

test('editMenuTemplate offers Copy for a selection outside fields', () => {
  assert.deepEqual(editMenuTemplate({ ...base, selectionText: 'hello' }, noop), [{ role: 'copy' }])
})

test('editMenuTemplate lists spelling suggestions before the edit roles', () => {
  const replaced: string[] = []
  const learned: string[] = []
  const items = editMenuTemplate(
    { ...base, isEditable: true, misspelledWord: 'teh', dictionarySuggestions: ['the', 'tech', 'ten', 'tea', 'teeth', 'tel'] },
    { replace: (w) => replaced.push(w), learn: (w) => learned.push(w) },
  )
  assert.deepEqual(
    items.slice(0, 5).map((i) => i.label),
    ['the', 'tech', 'ten', 'tea', 'teeth'],
  )
  ;(items[0].click as () => void)()
  ;(items.find((i) => i.label === 'Add to dictionary')!.click as () => void)()
  assert.deepEqual(replaced, ['the'])
  assert.deepEqual(learned, ['teh'])
  const redo = items.find((i) => i.role === 'redo')
  assert.equal(redo?.enabled, false)
  assert.ok(items.some((i) => i.role === 'paste'))
})

test('editMenuTemplate says when a misspelled word has no suggestions', () => {
  const items = editMenuTemplate({ ...base, isEditable: true, misspelledWord: 'qwrtz' }, noop)
  assert.deepEqual(items[0], { label: 'No suggestions', enabled: false })
})
