import assert from 'node:assert/strict'
import test from 'node:test'
import { findSnippet, rankScored } from './search'

test('rankScored keeps scores and ranks title matches above other texts', () => {
  const items = [
    { title: 'Brother Ash', summary: 'A monk' },
    { title: 'Corin Vale', summary: 'Friend of Ash' },
  ]
  const ranked = rankScored(items, 'ash', (i) => [i.title, i.summary])
  assert.deepEqual(
    ranked.map((r) => r.item.title),
    ['Brother Ash', 'Corin Vale'],
  )
  assert.ok(ranked[0].score > ranked[1].score)
  assert.equal(rankScored(items, '', (i) => [i.title]).length, 2)
})

test('findSnippet finds the matching line, marks the match and drops markdown syntax', () => {
  const body = '# Setup\n\nGrey snow falls on the **Ash Market**.\n\n- The party meets [[corin|Corin]] at the stall.'
  assert.deepEqual(findSnippet(body, 'ash market'), { before: 'Grey snow falls on the ', match: 'Ash Market', after: '.' })
  assert.deepEqual(findSnippet(body, 'corin'), { before: 'The party meets ', match: 'Corin', after: ' at the stall.' })
  assert.equal(findSnippet(body, 'dragon'), null)
})

test('findSnippet matches accents loosely and trims long lines around the match', () => {
  assert.equal(findSnippet('Le café de Rosé', 'rose')?.after, 'Le café de Rosé')
  const long = `${'word '.repeat(40)}needle ${'tail '.repeat(40)}`
  const s = findSnippet(long, 'needle')!
  assert.equal(s.match, 'needle')
  assert.ok(s.before.startsWith('…') && s.after.endsWith('…'))
  assert.ok((s.before + s.match + s.after).length <= 94)
})
