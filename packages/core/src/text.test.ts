import assert from 'node:assert/strict'
import test from 'node:test'
import { SUMMARY_MAX, textWarnings } from './schema'

test('textWarnings flags truncated titles and long summaries only', () => {
  assert.deepEqual(textWarnings({ title: 'Godric needs a spear', summary: 'Short.' }), [])
  assert.equal(textWarnings({ title: 'Godric needs a spear, so…' }).length, 1)
  assert.equal(textWarnings({ title: 'Godric needs a spear, so...' }).length, 1)
  assert.match(textWarnings({ summary: 'x'.repeat(SUMMARY_MAX + 1) })[0], /move detail to body/)
})
