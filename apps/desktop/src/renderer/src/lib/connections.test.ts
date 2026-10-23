import assert from 'node:assert/strict'
import test from 'node:test'
import { NODE_TYPES, type EdgeType, type NodeType } from '@maquest/core/schema'
import { inferConnectionType } from './connections'

const expected: Partial<Record<NodeType, Partial<Record<NodeType, EdgeType>>>> = {
  location: { location: 'located-at' },
  character: { location: 'located-at', faction: 'member-of', item: 'owns', character: 'relationship' },
  item: { location: 'located-at' },
  faction: { item: 'owns', faction: 'relationship' },
  scene: { location: 'located-at', character: 'involves', faction: 'involves', item: 'involves', scene: 'leads-to' },
  chapter: { location: 'located-at', character: 'involves', faction: 'involves', item: 'involves' },
}

for (const source of NODE_TYPES) {
  test(`${source} connections preserve direction and leave ambiguous targets as free links`, () => {
    for (const target of NODE_TYPES) {
      assert.equal(inferConnectionType(source, target), expected[source]?.[target] ?? 'link', `${source} → ${target}`)
    }
  })
}
