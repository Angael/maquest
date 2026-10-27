import type { Guideline } from '../schema'

type Default = Omit<Guideline, 'source' | 'disabled'>

/** Id of the guideline that holds the author's voice; shown alongside scenes the agent reads. */
export const STYLE_GUIDELINE_ID = 'style'

/**
 * Built-in writing guidelines. Projects override any of them by id via
 * `guidelines/<id>.md`, or add new ones with new ids. Keep them short: the
 * model already knows general craft; these exist to counter its habits and
 * capture what is specific to this author.
 */
export const DEFAULT_GUIDELINES: Default[] = [
  {
    id: STYLE_GUIDELINE_ID,
    title: "Author's style",
    scope: 'all',
    body: `Not filled in yet. Replace this with the author's real voice and taste for this project. Build it from the author's own pages or by asking a few questions, and keep it short and concrete:
- Voice: POV, tense, tone, sentence rhythm, vocabulary.
- Do: things the author likes.
- Avoid: things the author dislikes or has corrected.
- Sample: a short passage the author wrote that shows the voice.
Whenever the author corrects your writing or says what they like or dislike, add it here right away.`,
  },
  {
    id: 'collaboration',
    title: 'How to collaborate with the author',
    scope: 'all',
    body: `- Capture structure right away: when the author describes an idea, add the scene, entity, connection or backlog idea, then say briefly what changed.
- The story text is the author's. Write or rewrite prose only when asked. Otherwise suggest it, or offer a short draft for the author to accept.
- When you do write prose, read the style guideline and nearby scenes first, and match them.
- Make small, targeted edits. Never silently delete author-written content; park meaningful cuts in the backlog.
- Not sure where something belongs? Put it in the backlog (type \`idea\`).
- Titles are short complete phrases; summaries are one sentence. Keep the author's own wording in the body, not in the title or summary.
- Check for contradictions with established facts before suggesting anything.
- For big creative decisions, offer 2-3 genuinely different options and recommend one.`,
  },
  {
    id: 'prose',
    title: 'Prose: avoid common AI habits',
    scope: 'all',
    body: `- Don't explain what a scene already shows. Trust subtext; skip the line where a character realizes or the narrator sums up the feeling.
- Don't tie things up neatly. No closing epiphanies, lessons, or reflective summary at the end of a scene.
- Cut stock phrases and generic imagery ("a testament to", "couldn't help but", "the weight of", "a sense of"). Use one specific detail instead.
- Vary rhythm. Avoid lists of three, paired adjectives, and every paragraph ending on a punchline.
- Let characters be indirect, wrong, rude or funny. Dialogue shouldn't sound like everyone is equally articulate and kind.
- Keep the author's quirks. Don't smooth odd word choices or rules they break on purpose.`,
  },
  {
    id: 'character',
    title: 'Characters',
    scope: 'all',
    body: `- Major characters have a want, a need and a flaw that stands between them. Use the fields.
- Show them through choices under pressure, not through descriptions of their traits.
- The antagonist thinks they are right. Give them good reasons.
- Each character sounds different: rhythm, vocabulary, what they avoid saying.`,
  },
  {
    id: 'scene',
    title: 'Scenes',
    scope: 'all',
    body: `- Something has to change in every scene. If nothing changes, suggest cutting or merging it.
- Start late, end early. Don't open with the weather or end on a summary.
- Write a one-line summary in the \`summary\` field: "X tries to Y, but Z, so now W."`,
  },
  {
    id: 'structure',
    title: 'Story structure and stakes',
    scope: 'all',
    body: `- Use structure models (three acts, Save the Cat, etc.) to diagnose problems, not as templates to fill in.
- Escalate: each obstacle costs more or hits closer than the last. Personal stakes beat world-ending ones.
- The climax should test the protagonist's flaw, not just their skills.`,
  },
  {
    id: 'setup-payoff',
    title: 'Setup and payoff',
    scope: 'all',
    body: `- Record each setup as a \`foreshadows\` edge to its payoff, or to a backlog idea if the payoff doesn't exist yet.
- Plant setups early and casually; pay them off under pressure.
- When reviewing, list dangling setups and unearned payoffs.`,
  },
  {
    id: 'theme',
    title: 'Theme',
    scope: 'all',
    body: `- Don't preach. Let opposing values collide, and give both sides real force.
- Treat theme as a question the story explores, not an answer it states.`,
  },
  {
    id: 'worldbuilding',
    title: 'Worldbuilding and consistency',
    scope: 'all',
    body: `- Respect the established rules. Limits are more interesting than powers.
- Know more than you show; reveal it only when it matters.
- Before writing, check existing entities for names, dates and facts. Update entity notes with new canon.`,
  },
  {
    id: 'rpg-prep',
    title: 'RPG campaign prep',
    scope: 'rpg',
    body: `- **Prepare situations, not plots.** Players will derail you. Prepare factions with goals, NPCs with wants, and consequences, not fixed sequences.
- **Three-clue rule:** every conclusion the players must reach gets 3+ clues, recorded as \`clue-for\` edges. The overview flags gaps.
- Track fronts and threats with clocks on factions or threat nodes.
- Use boards with phase columns for loose acts, and \`branches-to\` edges for player choices.
- Open each session with action or a strong hook.
- Keep prep skimmable: bullets, bold key names, read-aloud text in blockquotes.
- When players act, the world reacts. Log it in the relevant entity notes.`,
  },
  {
    id: 'rpg-npc',
    title: 'NPCs, locations and encounters',
    scope: 'rpg',
    body: `- NPC: name, one-line role, want, a distinctive hook (voice/mannerism/look), what they know, and how they react to the party. About 5 lines.
- Location: first impression (read-aloud), what's here, who's here, what happens if poked, exits.
- Encounter: why it's happening, what the opposition wants, a twist, and how it can end without combat.
- Give real choices with visible consequences.`,
  },
  {
    id: 'screenplay',
    title: 'Screenplay',
    scope: 'screenplay',
    body: `- Write only what can be seen or heard. Action lines: 3-4 lines per paragraph at most.
- Dialogue carries subtext. Cut anything an actor could convey with a look.
- Roughly one page per minute; a feature runs about 90-120 pages.`,
  },
  {
    id: 'revision',
    title: 'Revision checklist',
    scope: 'all',
    body: `- Does every scene change something?
- Do stakes escalate? Are there sagging stretches?
- Dangling setups, unearned payoffs, or contradictions with established facts?
- Does the prose follow the style guideline and avoid the habits in the prose guideline?
- Does the ending answer the story's central question?`,
  },
]
