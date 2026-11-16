import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Project } from './project'
import {
  type MapDoc,
  applyMapOps,
  emptyMap,
  explore,
  lineMeasure,
  mapSummary,
  mapSvg,
  objectArea,
  pathCells,
  roomRegion,
  sight,
  traceCell,
  wallGeometry,
  formatDistance,
  sightSegments,
  intersection,
  rectRegion,
  visibility,
  type MapOp,
  type Pair,
} from './map'

const tmp = () => Project.init(fs.mkdtempSync(path.join(os.tmpdir(), 'maquest-map-')), { name: 'Maps' })

const area = (m: ReturnType<typeof roomRegion>) =>
  m.reduce(
    (sum, poly) =>
      sum +
      poly.reduce((s, ring, i) => {
        let a = 0
        for (let k = 0; k + 1 < ring.length; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1]
        return s + (i ? -1 : 1) * Math.abs(a / 2)
      }, 0),
    0,
  )

const edit = (doc: MapDoc, ops: MapOp[]) => applyMapOps(doc, ops).doc

test('rooms merge and cut in order', () => {
  const doc = edit(emptyMap(), [
    { op: 'add', object: { kind: 'room', x: 5, y: 5, shape: { type: 'rect', w: 4, h: 4 } } },
    { op: 'add', object: { kind: 'room', x: 8, y: 5, shape: { type: 'rect', w: 4, h: 2 } } },
    { op: 'add', object: { kind: 'room', op: 'subtract', x: 5, y: 5, shape: { type: 'rect', w: 2, h: 2 } } },
  ])
  // 16 + 8 - overlap(1×2 = 2) - hole 4
  assert.ok(Math.abs(area(roomRegion(doc)) - 18) < 1e-6)
})

test('a subtract circle on a hidden layer does not cut until its layer shows; groups swap', () => {
  let doc = edit(emptyMap(), [
    { op: 'layer', name: 'Before', group: 'battle' },
    { op: 'layer', name: 'After', group: 'battle', visible: false },
    { op: 'add', object: { kind: 'room', x: 5, y: 5, shape: { type: 'rect', w: 4, h: 4 } } },
    { op: 'add', object: { kind: 'room', op: 'subtract', x: 7, y: 5, layers: ['layer2'], shape: { type: 'ellipse', rx: 1, ry: 1 } } },
  ])
  assert.ok(Math.abs(area(roomRegion(doc)) - 16) < 1e-6)
  doc = edit(doc, [{ op: 'show', layer: 'layer2' }])
  assert.equal(doc.layers.find((l) => l.id === 'layer1')!.visible, false)
  assert.ok(area(roomRegion(doc)) < 15)
})

test('doors cut the walls and block sight only while closed', () => {
  const doc = edit(emptyMap(), [
    { op: 'add', object: { kind: 'room', x: 5, y: 5, shape: { type: 'rect', w: 4, h: 4 } } },
    { op: 'add', object: { kind: 'door', id: 'd', x: 7, y: 5, rotation: 90 } },
  ])
  const geo = wallGeometry(doc)
  // The ring is split by the door gap into one open chain.
  assert.equal(geo.rooms.length, 1)
  const closed = sightSegments(geo).length
  const open = sightSegments(wallGeometry(edit(doc, [{ op: 'update', id: 'd', set: { open: true } }]))).length
  // The door line plus the four sides of the gap it cut.
  assert.equal(closed, open + 5)
})

test('fog: a player inside a closed room sees only the room; explored grows', () => {
  const doc = edit(emptyMap(), [
    { op: 'add', object: { kind: 'room', x: 5, y: 5, shape: { type: 'rect', w: 4, h: 4 } } },
    { op: 'token', set: { name: 'Hero', x: 5.5, y: 5.5, player: true } },
    { op: 'fog', enabled: true },
  ])
  const s = sight(doc)
  const seen = area(s.visible)
  assert.ok(seen > 15 && seen < 16.5, `saw ${seen}`)
  const explored = explore([], s.visible)
  assert.ok(Math.abs(area(explored) - seen) < 0.1)
})

test('fog: in the dark a player sees only lit areas and darkvision', () => {
  const doc = edit(emptyMap(), [
    { op: 'token', set: { name: 'Hero', x: 5.5, y: 5.5, player: true, darkvision: 2 } },
    { op: 'add', object: { kind: 'light', x: 15.5, y: 5.5, bright: 1, dim: 2 } },
    { op: 'fog', enabled: true, ambient: 'dark' },
  ])
  const seen = area(sight(doc).visible)
  // darkvision circle (π·4) + light circle (π·4)
  assert.ok(Math.abs(seen - 8 * Math.PI) < 1, `saw ${seen}`)
})

test('ruler: line and traced cells with diagonal rules', () => {
  assert.deepEqual(lineMeasure({ x: 0.5, y: 0.5 }, { x: 3.5, y: 2.5 }, 'equal').cells, 3)
  assert.deepEqual(lineMeasure({ x: 0.5, y: 0.5 }, { x: 3.5, y: 2.5 }, 'alternate').cells, 4)
  let trace: Pair[] = []
  for (const c of [
    [0, 0],
    [3, 3],
    [3, 5],
  ] as Pair[])
    trace = traceCell(trace, c)
  assert.equal(trace.length, 6)
  assert.equal(pathCells(trace, 'equal'), 5)
  assert.equal(pathCells(trace, 'alternate'), 6)
  // Stepping back onto the previous cell undoes the step.
  assert.equal(traceCell(trace, [3, 4]).length, 5)
  assert.equal(formatDistance(5, { unit: { amount: 5, name: 'ft' } }), '25 ft')
})

test('bake and join make single path objects', () => {
  const doc = edit(emptyMap(), [
    { op: 'add', object: { kind: 'area', id: 'a', x: 5, y: 5, shape: { type: 'rect', w: 4, h: 4 } } },
    { op: 'add', object: { kind: 'area', id: 'b', x: 5, y: 5, shape: { type: 'ellipse', rx: 1, ry: 1 } } },
    { op: 'bake', ids: ['a', 'b'], mode: 'subtract' },
    {
      op: 'add',
      object: {
        kind: 'wall',
        id: 'w1',
        x: 0,
        y: 0,
        shape: {
          type: 'path',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
          ],
        },
      },
    },
    {
      op: 'add',
      object: {
        kind: 'wall',
        id: 'w2',
        x: 0,
        y: 0,
        shape: {
          type: 'path',
          points: [
            { x: 4, y: 2 },
            { x: 2, y: 0 },
          ],
        },
      },
    },
    { op: 'join', ids: ['w1', 'w2'] },
  ])
  const a = doc.objects.find((o) => o.id === 'a')!
  assert.ok(a.kind === 'area' && a.shape.type === 'path' && a.shape.holes?.length === 1)
  assert.ok(Math.abs(objectArea(a) - (16 - Math.PI)) < 0.05)
  const w = doc.objects.find((o) => o.id === 'w1')!
  assert.ok(w.kind === 'wall' && w.shape.type === 'path' && w.shape.points.length === 3)
  assert.equal(
    doc.objects.some((o) => o.id === 'w2'),
    false,
  )
})

test('a failing op leaves the map unchanged and names the op', () => {
  const doc = emptyMap()
  assert.throws(
    () =>
      applyMapOps(doc, [
        { op: 'add', object: { kind: 'room', x: 1, y: 1, shape: { type: 'rect', w: 1, h: 1 } } },
        { op: 'update', id: 'nope', set: {} },
      ]),
    /#2 \(update\): No object nope/,
  )
  assert.equal(doc.objects.length, 0)
})

test('map nodes store their document next to the node and export to svg', () => {
  const p = tmp()
  const n = p.createNode({ type: 'map', title: 'Old Mill' })
  assert.ok(fs.existsSync(path.join(p.root, 'maps', `${n.id}.map.json`)))
  p.editMap(n.id, [
    { op: 'style', set: { floor: { texture: 'wood' } } },
    { op: 'add', object: { kind: 'room', x: 5, y: 5, shape: { type: 'rect', w: 4, h: 4 } } },
    { op: 'add', object: { kind: 'label', x: 5, y: 5, text: 'Mill & <Co>' } },
  ])
  assert.equal(p.readMap(n.id).objects.length, 2)
  const svg = mapSvg(p.readMap(n.id))
  assert.match(svg, /^<\?xml/)
  assert.match(svg, /<pattern id="tex-wood/)
  assert.match(svg, /Mill &amp; &lt;Co&gt;/)
  assert.match(mapSummary(p.readMap(n.id), true), /room1 room rect 4×4 at \(5, 5\)/)
  p.renameNode(n.id, 'mill')
  assert.equal(p.readMap('mill').objects.length, 2)
  p.deleteNode('mill')
  assert.equal(fs.existsSync(path.join(p.root, 'maps', 'mill.map.json')), false)
})

test('a closed door at an angle to its wall seals the gap it cuts', () => {
  const doc = edit(emptyMap(), [
    {
      op: 'add',
      object: {
        kind: 'wall',
        x: -1,
        y: 5,
        shape: {
          type: 'path',
          points: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
          ],
        },
      },
    },
    { op: 'add', object: { kind: 'door', x: 5, y: 5, rotation: 14, width: 1 } },
    { op: 'token', set: { name: 'A', x: 3.5, y: 2.5, player: true } },
  ])
  const below = intersection(sight(doc).visible, rectRegion(0, 5.3, 30, 15))
  assert.equal(area(below), 0)
  // Opening it lets sight through again.
  const open = edit(doc, [{ op: 'update', id: 'door1', set: { open: true } }])
  assert.ok(area(intersection(sight(open).visible, rectRegion(0, 5.3, 30, 15))) > 1)
})

test('vision never comes back empty at odd positions next to walls and doors', () => {
  const doc = edit(emptyMap({ cols: 12, rows: 12 }), [
    { op: 'add', object: { kind: 'room', x: 6, y: 6, shape: { type: 'rect', w: 6, h: 6 } } },
    { op: 'add', object: { kind: 'room', x: 9, y: 6, shape: { type: 'ellipse', rx: 2, ry: 3 } } },
    { op: 'add', object: { kind: 'door', x: 6, y: 3, rotation: 0, width: 1, open: true } },
    {
      op: 'add',
      object: {
        kind: 'wall',
        x: 2,
        y: 2,
        shape: {
          type: 'path',
          points: [
            { x: 0, y: 0 },
            { x: 1.37, y: 3.11 },
            { x: 0.2, y: 6 },
          ],
        },
      },
    },
  ])
  for (let x = 0.13; x < 12; x += 0.29)
    for (let y = 0.11; y < 12; y += 0.31) {
      const v = visibility({ x, y }, sightSegments(wallGeometry(doc)), 4)
      assert.ok(area(v) > 0.05, `nothing visible from ${x}, ${y}`)
    }
})

test('new maps start from the project map defaults', () => {
  const project = tmp()
  project.updateConfig({
    maps: { grid: { diagonal: 'alternate', unit: { amount: 100, name: 'm' } }, style: { wall: { texture: 'stone' } }, fog: { enabled: true } },
  })
  const node = project.createNode({ type: 'map', title: 'Keep' })
  const doc = project.readMap(node.id)
  assert.equal(doc.grid.diagonal, 'alternate')
  assert.deepEqual(doc.grid.unit, { amount: 100, name: 'm' })
  assert.equal(doc.grid.cols, 30)
  assert.equal(doc.style.wall.texture, 'stone')
  assert.equal(doc.style.wall.width, 0.25)
  assert.equal(doc.fog.enabled, true)
  assert.match(mapSvg(doc), /<svg/)
})
