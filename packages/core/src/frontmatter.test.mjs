import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.ts'

for (const body of ['', 'A paragraph.', '\nA paragraph.\n', '\n\nA paragraph.', '  indented\n\n', '\r\n\r\nText\r\n']) {
  test(`frontmatter preserves body over repeated roundtrips: ${JSON.stringify(body)}`, () => {
    let text = stringifyFrontmatter({ title: 'Story' }, body)
    for (let round = 0; round < 5; round++) {
      const parsed = parseFrontmatter(text)
      assert.deepEqual(parsed.data, { title: 'Story' })
      assert.equal(parsed.body, body)
      text = stringifyFrontmatter(parsed.data, parsed.body)
    }
  })
}

test('reads CRLF metadata and consumes only the conventional separator', () => {
  assert.equal(parseFrontmatter('---\r\ntitle: Story\r\n---\r\n\r\n\r\nText\r\n').body, '\r\nText\r\n')
})

test('accepts metadata without a blank separator', () => {
  assert.equal(parseFrontmatter('---\ntitle: Story\n---\nText').body, 'Text')
})

test('leaves documents without frontmatter untouched', () => {
  const body = '\n\n# Heading\r\n'
  assert.deepEqual(parseFrontmatter(body), { data: {}, body })
})
