import assert from 'node:assert/strict'
import test from 'node:test'
import { editMenu, mediaRel, type EditItem, type EditParams } from './editMenu'

const flags = { canUndo: false, canRedo: false, canCut: false, canCopy: false, canPaste: true, canSelectAll: true }
const params = (patch: Partial<EditParams> = {}): EditParams => ({
  isEditable: false,
  selectionText: '',
  misspelledWord: '',
  dictionarySuggestions: [],
  editFlags: flags,
  linkURL: '',
  mediaType: 'none',
  srcURL: '',
  ...patch,
})
const labels = (items: EditItem[]) => items.map((i) => (i.type === 'separator' ? '—' : i.label))

test('nothing to offer on plain text gives no menu', () => {
  assert.deepEqual(editMenu(params(), { spellcheck: true }), [])
})

test('text fields get undo, clipboard, select all and the spellcheck switch, with enabled states', () => {
  const items = editMenu(params({ isEditable: true }), { spellcheck: false })
  assert.deepEqual(labels(items), ['Undo', 'Redo', '—', 'Cut', 'Copy', 'Paste', '—', 'Select all', '—', 'Check spelling while typing'])
  const byLabel = new Map(items.flatMap((i) => (i.type === 'separator' ? [] : [[i.label, i] as const])))
  assert.equal((byLabel.get('Cut') as { enabled?: boolean }).enabled, false)
  assert.equal((byLabel.get('Paste') as { enabled?: boolean }).enabled, true)
  assert.equal((byLabel.get('Check spelling while typing') as { checked: boolean }).checked, false)
})

test('a misspelled word leads with at most five suggestions and Add to dictionary', () => {
  const items = editMenu(params({ isEditable: true, misspelledWord: 'teh', dictionarySuggestions: ['the', 'ten', 'tea', 'tech', 'tee', 'tel'] }), {
    spellcheck: true,
  })
  assert.deepEqual(labels(items).slice(0, 7), ['the', 'ten', 'tea', 'tech', 'tee', 'Add to dictionary', '—'])
  const none = editMenu(params({ isEditable: true, misspelledWord: 'qzx' }), { spellcheck: true })
  assert.equal(labels(none)[0], 'No spelling suggestions')
})

test('selected text offers Copy and a project search with a shortened label', () => {
  const items = editMenu(params({ selectionText: 'the old lighthouse keeper of the northern isles', editFlags: { ...flags, canCopy: true } }), {
    spellcheck: true,
  })
  assert.deepEqual(labels(items), ['Copy', '—', 'Search project for “the old lighthouse keep…”'])
  const search = items.at(-1)
  assert.ok(search?.type === 'item' && search.arg === 'the old lighthouse keeper of the northern isles')
  // Multi-line selections are not searchable.
  assert.deepEqual(labels(editMenu(params({ selectionText: 'a\nb' }), { spellcheck: true })), ['Copy'])
})

test('web and mail links get open and copy; other schemes are ignored', () => {
  assert.deepEqual(labels(editMenu(params({ linkURL: 'https://example.com' }), { spellcheck: true })), ['Open link', 'Copy link address'])
  assert.deepEqual(labels(editMenu(params({ linkURL: 'mailto:a@b.c' }), { spellcheck: true })), ['Open link', 'Copy email address'])
  assert.deepEqual(editMenu(params({ linkURL: 'javascript:alert(1)' }), { spellcheck: true }), [])
})

test('project images can be viewed, copied and revealed; others only copied', () => {
  const own = editMenu(params({ mediaType: 'image', srcURL: 'maquest-media://p/media/map%201.png' }), { spellcheck: true })
  assert.deepEqual(labels(own), ['View full size', 'Copy image', 'Show in folder'])
  assert.deepEqual(labels(editMenu(params({ mediaType: 'image', srcURL: 'https://x/y.png' }), { spellcheck: true })), ['Copy image'])
  assert.equal(mediaRel('maquest-media://p/media/map%201.png'), 'media/map 1.png')
})
