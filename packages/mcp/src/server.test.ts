import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Project } from '@maquest/core'

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts')

/** A temporary project with the MCP server running on it over stdio, as an agent host would start it. */
async function connect(t: { after: (fn: () => Promise<void> | void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-mcp-'))
  const p = Project.init(root, { name: 'MCP' })
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', server, '--project', root], stderr: 'ignore' }))
  t.after(async () => {
    await client.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
    return { text: r.content.map((c) => c.text).join(''), isError: !!r.isError }
  }
  return { p, call }
}

test('live notes changed after the agent last saw them are not cleared', async (t) => {
  const { p, call } = await connect(t)
  p.setLiveNotes('- the goblin died\n')
  // Never shown to this agent: refused, and the refusal itself delivers the notes.
  const blind = await call('delete', { liveNotes: true })
  assert.equal(blind.isError, true)
  assert.match(blind.text, /changed since you last saw them[\s\S]*the goblin died/)
  assert.match(p.liveNotes(), /goblin/)

  // The author adds a note after the agent saw the first version.
  p.setLiveNotes('- the goblin died\n- the mayor lied\n')
  const n = p.createNode({ type: 'note', title: 'Victim' })
  const raced = await call('delete', { liveNotes: true, ids: [n.id] })
  assert.equal(raced.isError, true)
  assert.match(raced.text, /no nodes were deleted either[\s\S]*the mayor lied/)
  assert.ok(p.getNode(n.id), 'nodes in a rejected call are kept')
  assert.match(p.liveNotes(), /mayor/)

  const ok = await call('delete', { liveNotes: true })
  assert.equal(ok.isError, false)
  assert.equal(p.liveNotes(), '')
})

test('a notice that goes out with a result marks the notes seen', async (t) => {
  const { p, call } = await connect(t)
  p.setLiveNotes('- add a tavern\n')
  const seen = await call('find', {})
  assert.match(seen.text, /IMPORTANT: the author updated their live notes[\s\S]*add a tavern/)
  const cleared = await call('delete', { liveNotes: true })
  assert.equal(cleared.isError, false, cleared.text)
  assert.equal(p.liveNotes(), '')
})

test('write reports per-item outcomes and writes nothing when validation fails', async (t) => {
  const { p, call } = await connect(t)
  const log = p.createNode({ type: 'note', title: 'Log', body: 'start' })
  const bad = await call('write', {
    nodes: [
      { id: log.id, appendBody: 'one' },
      { id: 'sesja-2-plan', summary: 'x' },
    ],
  })
  assert.equal(bad.isError, true)
  assert.match(bad.text, /Nothing was written: 1 of 2 items failed validation/)
  assert.match(bad.text, /#2 failed: Node not found: sesja-2-plan/)
  assert.match(bad.text, /Not run \(valid\): #1/)
  assert.equal(p.requireNode(log.id).body.trim(), 'start')

  const ok = await call('write', {
    nodes: [
      { create: true, id: 'sesja-2-plan', type: 'note', title: 'Plan' },
      { id: log.id, appendBody: 'see [[sesja-2-plan]]' },
    ],
  })
  assert.equal(ok.isError, false, ok.text)
  assert.match(ok.text, /^#1 created sesja-2-plan \(note\) Plan on main\n#2 updated log/)
})

test('reads stay within budget, list what was left out and give oversized nodes an outline', async (t) => {
  const { p, call } = await connect(t)
  const big = p.createNode({
    type: 'note',
    title: 'Spellbook',
    body: ['# Cantrips', 'x'.repeat(3000), '# Level 1', 'y'.repeat(3000), '## Shield', 'z'.repeat(500)].join('\n'),
  })
  const a = p.createNode({ type: 'note', title: 'Small A', body: 'a'.repeat(1800) })
  const b = p.createNode({ type: 'note', title: 'Small B', body: 'b'.repeat(1800) })

  const r = await call('read', { ids: [a.id, big.id, b.id, 'smal-a'], maxChars: 4000 })
  assert.equal(r.isError, false, r.text)
  assert.ok(r.text.length < 4800, `read output ${r.text.length} chars`)
  assert.match(r.text, /# Small A/)
  assert.match(r.text, /Body \(not shown: too large for one read\)[\s\S]*line 3: # Level 1/)
  assert.match(r.text, new RegExp(`Not returned, to stay within 4,000 chars \\(read them in another call\\): ${b.id}`))
  assert.match(r.text, /Node not found: smal-a\. Did you mean: small-a/)
  assert.ok(r.text.includes(p.resolve(big.path)), 'oversized nodes name their file for a direct read')

  const part = await call('read', { ids: [big.id], section: 'Shield' })
  assert.match(part.text, /## Body \(lines 5–6 of 6\)\n## Shield\nz{500}$/)

  const cut = await call('read', { ids: [big.id], lines: { from: 1 }, maxChars: 4000 })
  assert.match(cut.text, /Cut at line 3 .*continue with lines: \{ from: 4 \}/)
})

test('board groups builds a nested tree and lays out the board in one call', async (t) => {
  const { p, call } = await connect(t)
  const [hall, gate] = ['Hall', 'Gate'].map((title) => p.createNode({ type: 'location', title }))
  const r = await call('board', {
    action: 'group',
    groups: [
      { title: 'City', nodes: [gate.id] },
      { title: 'Tavern', nodes: [hall.id], parent: 'City' },
    ],
  })
  assert.equal(r.isError, false, r.text)
  assert.match(r.text, /#1 created group g-\w+: City, 1 card\n#2 created group g-\w+: Tavern \(in g-\w+\), 1 card\narranged main \(smart\)/)
  const groups = p.board('main').groups
  assert.equal(groups.find((g) => g.title === 'Tavern')?.parent, groups.find((g) => g.title === 'City')?.id)
})

test('project update without a name keeps the name', async (t) => {
  const { p, call } = await connect(t)
  p.updateConfig({ description: 'A campaign' })
  const r = await call('project', { action: 'update', kind: 'rpg' })
  assert.equal(r.isError, false, r.text)
  assert.equal(p.config().name, 'MCP')
  assert.equal(p.config().kind, 'rpg')
  assert.equal(p.config().description, 'A campaign')
})

test('checks: overview summarizes, checks: true lists issues, writes report the touched nodes', async (t) => {
  const { p, call } = await connect(t)
  const typed = await call('project', {
    action: 'update',
    types: {
      monster: {
        label: 'Monster',
        fields: [
          { key: 'ac', label: 'AC', widget: 'stat', required: true },
          { key: 'hp', widget: 'meter', style: 'ring' },
          { key: 'scores', widget: 'scores', keys: ['str'], labels: { str: 'STR' }, modifier: { base: 10, step: 2 } },
        ],
        tabs: [{ title: 'Stats', kind: 'fields' }],
      },
    },
  })
  assert.equal(typed.isError, false, typed.text)
  assert.match(typed.text, /monster \(3 fields\)/)
  const created = await call('write', { nodes: [{ type: 'monster', title: 'Wight', status: 'draft', body: 'Serves [[theron]].' }] })
  assert.equal(created.isError, false, created.text)
  assert.match(created.text, /Maquest detected for these nodes[\s\S]*wight \[broken-link\]: links to \[\[theron\]\][\s\S]*wight \[field-missing\]: lacks AC/)

  const overview = await call('overview', {})
  assert.match(overview.text, /## Maquest checks\nMaquest detected 1 error, 1 warning\./)
  assert.match(
    overview.text,
    /## Sheets[\s\S]*- monster: ac\* \[stat\] "AC"; hp \[meter, ring\]; scores \[scores, keys str, modifier \(v-10\)\/2\]\n  tabs: Stats \(fields\)/,
  )

  const report = await call('overview', { checks: true })
  assert.match(report.text, /^Maquest detected 1 error, 1 warning\.\n\n## broken-link \(error, 1\) — Broken links\nFix: /)

  const fields = await call('write', {
    nodes: [
      {
        id: 'wight',
        fields: { ac: { value: 14, note: 'natural' }, hp: { value: 30, max: 82 }, scores: { str: 15 } },
        edits: [{ find: '[[theron]]', replace: 'Theron' }],
      },
    ],
  })
  assert.doesNotMatch(fields.text, /Maquest detected/)
  const read = await call('read', { ids: ['wight'] })
  assert.match(read.text, /ac: 14 \(natural\)\nhp: 30\/82\nscores: STR 15 \(\+2\)/)

  const configured = await call('project', { action: 'update', checks: { 'field-missing': 'off' } })
  assert.equal(configured.isError, false, configured.text)
  assert.equal(p.config().checks?.['field-missing'], 'off')
})

test('agents draw a map with layers and export it to svg', async (t) => {
  const { p, call } = await connect(t)
  const defaults = await call('project', { action: 'update', maps: { grid: { unit: { amount: 100, name: 'm' }, diagonal: 'euclid' } } })
  assert.equal(defaults.isError, false, defaults.text)
  const created = await call('write', { nodes: [{ type: 'map', title: 'Town square' }] })
  assert.equal(created.isError, false, created.text)
  const id = p.listNodes({ type: 'map' })[0].id
  assert.equal(p.readMap(id).grid.diagonal, 'euclid')
  assert.equal(p.readMap(id).grid.unit.name, 'm')
  const edit = await call('map', {
    action: 'edit',
    id,
    ops: [
      { op: 'layer', name: 'Before the battle', group: 'battle' },
      { op: 'layer', name: 'After the battle', group: 'battle', visible: false },
      { op: 'add', object: { kind: 'room', x: 10, y: 8, shape: { type: 'rect', w: 8, h: 6 } } },
      { op: 'add', object: { kind: 'room', op: 'subtract', x: 14, y: 8, layers: ['layer2'], shape: { type: 'ellipse', rx: 1.5, ry: 1.5 } } },
      { op: 'add', object: { kind: 'door', x: 10, y: 11, width: 1 } },
      { op: 'token', set: { name: 'Aria', x: 10.5, y: 8.5, player: true } },
      { op: 'show', layer: 'layer2' },
    ],
  })
  assert.equal(edit.isError, false, edit.text)
  assert.match(edit.text, /showing layer2; layer1 hidden/)
  const read = await call('map', { action: 'read', id, full: true })
  assert.match(read.text, /room2 room circle r1.5 subtract at \(14, 8\) layers layer2/)
  assert.match(read.text, /token1 token "Aria"/)
  const bad = await call('map', { action: 'edit', id, ops: [{ op: 'add', object: { kind: 'room', layers: ['nope'], shape: { type: 'rect', w: 1, h: 1 } } }] })
  assert.equal(bad.isError, true)
  assert.match(bad.text, /Unknown layer nope/)
  const exported = await call('map', { action: 'export', id })
  assert.equal(exported.isError, false, exported.text)
  assert.match(fs.readFileSync(path.join(p.root, 'media', `${id}.svg`), 'utf8'), /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
})
