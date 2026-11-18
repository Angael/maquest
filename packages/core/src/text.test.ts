import assert from 'node:assert/strict'
import test from 'node:test'
import { SUMMARY_MAX, TITLE_MAX, longWord, textWarnings } from './schema'

test('textWarnings flags truncated titles and long summaries only', () => {
  assert.deepEqual(textWarnings({ title: 'Godric needs a spear', summary: 'Short.' }), [])
  assert.equal(textWarnings({ title: 'Godric needs a spear, so…' }).length, 1)
  assert.equal(textWarnings({ title: 'Godric needs a spear, so...' }).length, 1)
  assert.match(textWarnings({ summary: 'x'.repeat(SUMMARY_MAX + 1) })[0], /move detail to body/)
})

test('long titles, run-together words and long tags are flagged; links and spaceless scripts are not', () => {
  assert.match(textWarnings({ title: 'A'.repeat(TITLE_MAX + 1) })[0], /title is 81 chars/)
  assert.match(textWarnings({ summary: `The ${'Ultra'.repeat(10)} beast.` })[0], /50-char word/)
  assert.match(textWarnings({ tags: ['ok', 'a tag that is really a whole sentence'] })[0], /a tag is over 32 chars/)
  assert.equal(longWord('see https://example.com/a/very/long/path/that/goes/on/and/on/for/ever'), undefined)
  assert.equal(longWord('[[a-very-long-node-id-that-is-still-a-link-to-somewhere]]'), undefined)
  assert.equal(longWord('well-known-and-very-long-but-hyphenated-words-break-fine'), undefined)
  assert.equal(longWord('東京の古い寺で夜明けに鐘が鳴り響き、旅人たちは静かに祈りを捧げてから山道を登り始めた。'), undefined)
})
