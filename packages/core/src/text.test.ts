import assert from 'node:assert/strict'
import test from 'node:test'
import { SUMMARY_MAX, textWarnings } from './schema'

test('textWarnings flags truncated titles and long summaries only', () => {
  assert.deepEqual(textWarnings({ title: 'Godric needs a spear', summary: 'Short.' }), [])
  assert.equal(textWarnings({ title: 'Godric needs a spear, so…' }).length, 1)
  assert.equal(textWarnings({ title: 'Godric needs a spear, so...' }).length, 1)
  assert.match(textWarnings({ summary: 'x'.repeat(SUMMARY_MAX + 1) })[0], /move detail to body/)
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compileManuscript, countWords, demoteHeadings, readingMinutes } from './text'
import { Project } from './project'

test('countWords counts what a reader sees, not markdown syntax', () => {
  assert.equal(countWords(''), 0)
  assert.equal(countWords('# Setup\n\nGrey snow falls on the **Ash Market**.'), 8)
  assert.equal(countWords('- one\n- two\n1. three'), 3)
  assert.equal(countWords('Meet [[corin-vale|Corin]] at [the stall](https://example.com). ![map](media/m.png)'), 5)
  assert.equal(countWords('Before\n```js\nconst code = 1\n```\nafter <!-- hidden note -->'), 2)
  assert.equal(countWords("It's a well-known fact"), 4)
  assert.ok(countWords('東京へ行きます') > 1)
  assert.equal(readingMinutes(0), 0)
  assert.equal(readingMinutes(10), 1)
  assert.equal(readingMinutes(2300), 10)
})

test('demoteHeadings nests body headings and leaves code fences alone', () => {
  assert.equal(demoteHeadings('# Beats\ntext\n```\n# not a heading\n```\n###### Deep', 2), '### Beats\ntext\n```\n# not a heading\n```\n###### Deep')
})

test('compileManuscript writes titles as nested headings and resolves links', () => {
  const doc = compileManuscript(
    {
      id: 's',
      title: 'Story',
      body: 'Intro with [[hero]].',
      children: [{ id: 'c', title: 'Chapter', body: '', children: [{ id: 'x', title: 'Scene', body: '# Beats\n![m](media/a.png)', children: [] }] }],
    },
    { titles: new Map([['hero', 'Vess']]), media: (p) => `/abs/${p}` },
  )
  assert.equal(doc, '# Story\n\nIntro with Vess.\n\n## Chapter\n\n### Scene\n\n#### Beats\n![m](/abs/media/a.png)\n')
})

test('Project.manuscript follows outline order and skips notes; outline counts words', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-text-'))
  try {
    const p = Project.init(path.join(root, 'p'), { name: 'T' })
    const story = p.createNode({ type: 'story', title: 'Saga', template: false })
    const ch = p.createNode({ type: 'chapter', title: 'One', parent: story.id, template: false })
    const b = p.createNode({ type: 'scene', title: 'Second', parent: ch.id, body: 'Two words.' })
    const a = p.createNode({ type: 'scene', title: 'First', parent: ch.id, body: 'Three short words.' })
    p.createNode({ type: 'note', title: 'Planning', parent: ch.id, body: 'Not prose.' })
    p.reorder([a.id, b.id])
    assert.equal(p.manuscript(story.id), '# Saga\n\n## One\n\n### First\n\nThree short words.\n\n### Second\n\nTwo words.\n')
    const outline = p.outline()
    assert.equal(outline[0].children[0].children.find((s) => s.id === a.id)?.words, 3)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
