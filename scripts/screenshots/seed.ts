import fs from 'node:fs'
import path from 'node:path'
import { Project, type EdgeType } from '../../packages/core/src/index'

const row = (y: number, ids: [string, number][]) => Object.fromEntries(ids.map(([id, x]) => [id, { x, y }]))

/** Seeds "The Ember Crown", a rich demo RPG campaign used by the screenshot harness. */
export function seedEmberCrown(root: string) {
  const p = Project.init(root, { name: 'The Ember Crown', kind: 'rpg', description: 'A dark-fantasy campaign of fire, debts and a stolen crown.' })
  p.setTypes({ clue: { label: 'Clue', plural: 'Clues', color: '#14b8a6', icon: 'search', fields: ['points to', 'found at'] } })

  const story = p.createNode({
    type: 'story',
    title: 'The Ember Crown',
    status: 'draft',
    tags: ['campaign', 'dark-fantasy'],
    summary: 'A thief-for-hire is drawn into a war of succession over a crown that burns whoever wears it.',
    body: `# The Ember Crown

A campaign for 4–5 players, levels 3–8.

## Premise

The **Ember Crown** was forged to bind a fire-spirit to the royal line. When the old king dies, the crown is stolen
the same night, and the city of Emberhold begins to *burn from the inside out*.

## Themes

- Debts that outlive the people who made them
- Power that consumes its holder
- Found family among outcasts

> "Every crown is a promise. This one is a threat."
> — Brother Ash
`,
  })
  const ch1 = p.createNode({
    type: 'chapter',
    parent: story.id,
    title: 'Chapter 1: Ashes and Bells',
    status: 'revised',
    summary: 'The party is hired to find a missing ledger and stumbles onto the theft of the crown.',
    body: '## Goals\n\n- Introduce Vess and the Lanternwrights\n- Plant the bell-tower sigil\n- End on the first fire\n',
  })
  const ch2 = p.createNode({
    type: 'chapter',
    parent: story.id,
    title: 'Chapter 2: The Siege',
    status: 'draft',
    summary: 'The Cinder Court lays siege to Emberhold while the party races to unmake the crown.',
    body: '## Goals\n\n- Escalate the Cinder Court clock\n- Force a choice between Corin and the city\n',
  })
  const sceneFields: Record<string, Record<string, string>> = {
    'The Ash Market': {
      pov: 'Vess',
      goal: 'Recover the ledger',
      conflict: 'The broker is dead; enforcers close in',
      outcome: 'Escapes with the ledger and Corin',
    },
    'Whispers in the Bell Tower': {
      pov: 'Vess',
      goal: 'Read the sigil',
      conflict: 'Brother Ash demands a favor',
      outcome: 'Learns the crown’s true name, owes a debt',
    },
    'Flight Across the Glass Dunes': {
      pov: 'Maelis',
      goal: 'Reach the Lanternwrights',
      conflict: 'Glass storm, pursuit',
      outcome: 'Arrive wounded; the crown calls',
    },
    'The Siege of Emberhold': { pov: 'Corin', goal: 'Hold the gate', conflict: 'Iselde’s fire-priests', outcome: 'Tunnels open, the gate falls' },
    'The Crown Unmade': { pov: 'Maelis', goal: 'Break the binding', conflict: 'The spirit wants a new host', outcome: 'TBD at the table' },
  }
  const scene = (title: string, parent: string, summary: string, status: 'idea' | 'draft' | 'revised' | 'done', body: string, tags: string[] = []) =>
    p.createNode({ type: 'scene', parent, title, summary, status, body, tags, fields: sceneFields[title] })
  const s1 = scene(
    'The Ash Market',
    ch1.id,
    'Vess wants the ledger, but the broker is already dead, so she must flee with a stranger.',
    'done',
    `## Setup

Grey snow falls on the **Ash Market**. Stalls sell relics salvaged from the burned quarter.

## Beats

1. The party meets their contact, Corin, at the cinder-tea stall.
2. The broker's tent is found *empty*, a scorched ledger left behind.
3. Cinder Court enforcers arrive. Chase through the stalls.

## Read-aloud

> The air tastes of iron and cloves. Somewhere a bell rings once, and every merchant falls silent.

## Notes

- If the party hesitates, the enforcers burn the tent.
- [x] Prep the chase map
- [ ] Stat block for the enforcer captain
`,
    ['opening', 'chase'],
  )
  const s2 = scene(
    'Whispers in the Bell Tower',
    ch1.id,
    'The party climbs the old tower to read the sigil, but Brother Ash is waiting for them.',
    'revised',
    `## Setup

The bell tower has been silent for twenty years. Tonight it rang.

## Beats

- Climb (Athletics DC 13) past rotten stairs.
- The **sigil** carved into the bell matches the ledger's seal.
- Brother Ash offers a bargain: the crown's true name for a favor owed.

> "You came for answers. I only trade in debts."
`,
    ['investigation'],
  )
  const s3 = scene(
    'Flight Across the Glass Dunes',
    ch1.id,
    'The party escapes the city across the dunes, while the crown calls to Maelis.',
    'draft',
    '## Beats\n\n- Navigation challenge (3 successes before 3 failures)\n- Glass storm: everyone takes 2d6 slashing unless sheltered\n- Maelis dreams of the crown\n',
    ['travel'],
  )
  const s4 = scene(
    'The Siege of Emberhold',
    ch2.id,
    'The Cinder Court breaches the walls, but the Lanternwrights open the old tunnels.',
    'draft',
    '## Beats\n\n- Mass combat in three waves\n- The Lanternwrights reveal the tunnels\n- Queen Iselde demands the crown\n',
    ['battle'],
  )
  const s5 = scene(
    'The Crown Unmade',
    ch2.id,
    'Maelis must choose to wear the crown or break it, and either choice costs a life.',
    'idea',
    '## Possible endings\n\n- **Wear it:** Maelis becomes the new binder, losing her memories\n- **Break it:** the fire-spirit is freed and Emberhold burns\n',
    ['finale'],
  )

  const character = (title: string, summary: string, fields: Record<string, string>, tags: string[], body: string) =>
    p.createNode({ type: 'character', title, summary, fields, tags, body })
  const vess = character(
    'Vess Coldwater',
    'A debt-bound thief who steals to pay off a family obligation.',
    { role: 'Protagonist', goal: 'Clear her family debt', fear: 'Owing anyone again', voice: 'Dry, clipped, never says thank you' },
    ['pc', 'rogue'],
    '## Background\n\nRaised in the Lantern quarter. Her mother sold Vess’s *future service* to the Cinder Court.\n\n## Secrets\n\n- She has met Brother Ash before\n',
  )
  const corin = character(
    'Corin Vale',
    'A charming fence who works both sides of every deal.',
    { role: 'Ally / possible traitor', goal: 'Get out of Emberhold rich', fear: 'Fire' },
    ['npc', 'merchant'],
    '## Hooks\n\n- Owes money to Queen Iselde\n- Genuinely likes Vess\n',
  )
  const maelis = character(
    'Maelis of the Embers',
    'Last scion of the royal line; the crown already knows her name.',
    { role: 'Heir', goal: 'Undo the binding', fear: 'Becoming her father' },
    ['npc', 'royal'],
    '## Arc\n\nFrom hunted heir to the one who decides the crown’s fate.\n',
  )
  const ash = character(
    'Brother Ash',
    'A monk who trades in secrets and keeps every promise, literally.',
    { role: 'Mentor / antagonist', goal: 'Free the fire-spirit', fear: 'Being forgotten' },
    ['npc', 'mystic'],
    '## Tactics\n\n- Never lies; omits\n- Collects favors as currency\n',
  )
  const iselde = character(
    'Queen Iselde',
    'Regent of the Cinder Court, patient as a banked fire.',
    { role: 'Antagonist', goal: 'Wear the Ember Crown', fear: 'Irrelevance' },
    ['npc', 'villain'],
    '## Motivation\n\nBelieves only she can control the spirit.\n',
  )

  const map = p.writeMedia(
    'emberhold-map.svg',
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="300" viewBox="0 0 512 300">
<defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#7c2d12"/><stop offset="1" stop-color="#1c1917"/></radialGradient></defs>
<rect width="512" height="300" fill="url(#g)"/>
<path d="M40 240 C140 180 200 260 300 200 S460 120 490 160" stroke="#fbbf24" stroke-width="4" fill="none" stroke-dasharray="10 8"/>
<circle cx="256" cy="130" r="58" fill="none" stroke="#f59e0b" stroke-width="6"/>
<circle cx="256" cy="130" r="20" fill="#f97316"/>
<g fill="#a8a29e"><rect x="110" y="70" width="40" height="30"/><rect x="360" y="80" width="50" height="34"/><rect x="180" y="200" width="36" height="28"/></g>
<text x="256" y="285" font-family="serif" font-size="22" fill="#fde68a" text-anchor="middle">EMBERHOLD</text>
</svg>`),
  )
  const location = (title: string, summary: string, fields: Record<string, string>, extra: { media?: string[]; tags?: string[] } = {}) =>
    p.createNode({ type: 'location', title, summary, fields, tags: extra.tags ?? [], media: extra.media, body: `## Sights\n\n- ${summary}\n` })
  const emberhold = location(
    'Emberhold',
    'A walled city built around a dormant volcano vent.',
    { population: '40,000', ruler: 'Queen Iselde (regent)' },
    { media: [map], tags: ['city'] },
  )
  const market = location('The Ash Market', 'Relic stalls under perpetual grey snow.', { danger: 'Pickpockets, enforcers' }, { tags: ['district'] })
  const dunes = location('The Glass Dunes', 'Desert of fused glass that sings in the wind.', { travel: '3 days on foot' }, { tags: ['wilds'] })

  const court = p.createNode({
    type: 'faction',
    title: 'The Cinder Court',
    summary: 'The regent’s fire-priests and enforcers.',
    tags: ['front', 'villains'],
    fields: { leader: 'Queen Iselde', resources: 'Enforcers, fire-priests' },
    clock: { size: 6, filled: 3, steps: ['Enforcers search the market', 'Curfew', 'Lanternwrights arrested', 'Walls sealed', 'Siege', 'Crown claimed'] },
    body: '## Front: The Burning Throne\n\nIf unchecked, Iselde claims the crown by the next new moon.\n',
  })
  const lantern = p.createNode({
    type: 'faction',
    title: 'The Lanternwrights',
    summary: 'A guild of tunnelers and lamp-makers who remember the old city.',
    tags: ['allies'],
    fields: { leader: 'Mother Tallow' },
    body: '## Offer\n\nSafe passage through the undercity, for a price.\n',
  })
  const crown = p.createNode({
    type: 'item',
    title: 'The Ember Crown',
    summary: 'A crown of black iron; it burns anyone not of the royal line.',
    tags: ['artifact', 'macguffin'],
    fields: { rarity: 'Artifact', attunement: 'Royal blood only' },
    body: '## Properties\n\n- Resistance to fire\n- Whispers the wearer’s worst memory each dawn\n',
  })
  const key = p.createNode({
    type: 'item',
    title: 'The Glass Key',
    summary: 'Opens the vault beneath the bell tower.',
    tags: ['key'],
    fields: { rarity: 'Rare' },
  })
  const ledger = p.createNode({
    type: 'clue',
    title: 'Scorched ledger',
    summary: 'A broker’s ledger, half-burned, listing a debt owed by the crown itself.',
    fields: { 'points to': 'Brother Ash', 'found at': 'The Ash Market' },
    tags: ['clue'],
  })
  const sigil = p.createNode({
    type: 'clue',
    title: 'Bell-tower sigil',
    summary: 'The seal carved into the bell matches the ledger’s wax seal.',
    fields: { 'points to': 'The Ember Crown', 'found at': 'Bell tower' },
    tags: ['clue'],
  })
  const prep = p.createNode({
    type: 'note',
    parent: ch1.id,
    title: 'GM prep: session 4',
    summary: 'Reminders for the next session.',
    body: '## Before the session\n\n- [ ] Print the Glass Dunes hex map\n- [x] Name the enforcer captain (Sergeant Brask)\n- [ ] Decide what Corin knows\n',
  })

  for (const [title, summary, tag] of [
    ['What if Corin is Iselde’s son?', 'Would explain his debt and the queen’s *patience* with him.', 'twist'],
    ['A heist inside the vault', 'Mid-campaign one-shot using the **Glass Key**.\n\n- Needs a floor plan\n- Two rival crews', 'side-quest'],
    ['The spirit speaks through bells', 'Every bell in the city rings when the crown is worn.', 'lore'],
    ['Mother Tallow’s betrayal', 'The Lanternwrights sell the tunnels to the court.', 'twist'],
  ]) {
    p.createNode({ type: 'idea', title, summary: summary.split('\n')[0].replaceAll('*', ''), body: `${summary}\n`, tags: [tag] })
  }

  const edge = (source: string, target: string, type: EdgeType, label?: string) => p.addEdge({ source, target, type, label })
  edge(s1.id, s2.id, 'leads-to')
  edge(s2.id, s3.id, 'leads-to')
  edge(s3.id, s4.id, 'leads-to')
  edge(s4.id, s5.id, 'leads-to')
  edge(s2.id, s5.id, 'foreshadows', 'the true name')
  edge(s1.id, vess.id, 'involves')
  edge(s1.id, corin.id, 'involves')
  edge(s1.id, market.id, 'located-at')
  edge(s2.id, ash.id, 'involves')
  edge(s3.id, dunes.id, 'located-at')
  edge(s3.id, maelis.id, 'involves')
  edge(s4.id, emberhold.id, 'located-at')
  edge(s4.id, iselde.id, 'involves')
  edge(vess.id, corin.id, 'relationship', 'old partners')
  edge(maelis.id, ash.id, 'relationship', 'owes a debt to')
  edge(corin.id, iselde.id, 'relationship', 'secretly reports to')
  edge(vess.id, maelis.id, 'relationship', 'sworn protector')
  edge(iselde.id, court.id, 'member-of')
  edge(court.id, crown.id, 'owns')
  edge(ledger.id, ash.id, 'clue-for', 'debt names him')
  edge(sigil.id, crown.id, 'clue-for')
  edge(crown.id, s5.id, 'foreshadows', 'the crown burns')
  edge(market.id, emberhold.id, 'link', 'district of')

  // Main board: story structure on top, cast in the middle, places and fronts below.
  p.setLayout({
    ...row(0, [
      [story.id, 0],
      [ch1.id, 450],
      [ch2.id, 1350],
    ]),
    ...row(260, [
      [s1.id, 150],
      [s2.id, 450],
      [s3.id, 750],
      [s4.id, 1200],
      [s5.id, 1500],
    ]),
    ...row(560, [
      [vess.id, 0],
      [corin.id, 300],
      [maelis.id, 600],
      [ash.id, 900],
      [crown.id, 1200],
      [ledger.id, 1500],
    ]),
    ...row(900, [
      [emberhold.id, 0],
      [market.id, 300],
      [dunes.id, 600],
      [prep.id, 1200],
      [court.id, 1500],
    ]),
  })
  p.createGroup('main', { title: 'The Ashen Reach', color: 'emerald', nodes: [emberhold.id, market.id, dunes.id] })

  // Second board: the siege, laid out in phase columns.
  const siege = p.createBoard({ title: 'Act II: The Siege', phases: ['Approach', 'Breach', 'Aftermath'] })
  p.setLayout(
    {
      [court.id]: { x: 40, y: 80 },
      [iselde.id]: { x: 40, y: 380 },
      [lantern.id]: { x: 600, y: 80 },
      [s4.id]: { x: 600, y: 380 },
      [key.id]: { x: 1160, y: 80 },
      [sigil.id]: { x: 1160, y: 380 },
      [s5.id]: { x: 1460, y: 230 },
    },
    siege.id,
  )

  p.setGuideline('ember-tone', {
    title: 'Ember Crown: tone & table rules',
    scope: 'rpg',
    body: `## Tone

- Dark fantasy, but never grimdark: **hope survives**, barely.
- Fire is always personal. Describe what it takes from people.

## Table rules

1. Every major NPC wants something from the party.
2. Clues follow the three-clue rule.
3. No scene ends without a cost or a new question.

> Keep read-aloud text under 60 words.
`,
  })
  p.setLiveNotes(
    'Session 4 — live\n\n- Vess pickpocketed the enforcer captain (crit!)\n- Corin lied about the ledger; players suspect\n- Next: bell tower at midnight\n',
  )
  return {
    project: p,
    ids: { story, ch1, ch2, s1, s2, s3, s4, s5, vess, corin, maelis, ash, iselde, emberhold, market, dunes, court, lantern, crown, key, ledger, sigil, prep },
    boards: { siege: siege.id },
  }
}

/** Small extra projects so the start screen shows a populated Recent list. */
export function seedRecents(dir: string, profile: string, main: string) {
  const extra = [
    { name: 'Neon Tides', kind: 'screenplay' as const },
    { name: 'Letters from Vell', kind: 'novel' as const },
    { name: 'Saltmarsh Nights', kind: 'rpg' as const },
  ].map(({ name, kind }) => {
    const p = Project.init(path.join(dir, name.toLowerCase().replaceAll(' ', '-')), { name, kind })
    p.createNode({ type: 'story', title: name })
    return p.root
  })
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'recent.json'), JSON.stringify([main, ...extra], null, 2))
}
