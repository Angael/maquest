import type { Guideline } from '../schema'

type Default = Omit<Guideline, 'source' | 'disabled'>

/**
 * Built-in writing guidelines. Projects override any of them by id via
 * `guidelines/<id>.md`, or add new ones with new ids.
 */
export const DEFAULT_GUIDELINES: Default[] = [
  {
    id: 'collaboration',
    title: 'How to collaborate with the author',
    scope: 'all',
    body: `- Be proactive: when the author describes an idea, put it into the project right away (scene, entity, link, backlog idea), then summarize what you changed.
- Respect the author's voice. Match the existing tone, tense, POV and vocabulary. Read nearby scenes before writing new prose.
- Prefer small targeted edits. Never delete author-written content silently. If you cut something meaningful, park it in the backlog.
- Unsure where something belongs? Put it in the backlog (type \`idea\`) instead of forcing it into the structure.
- Keep the graph truthful: when a scene involves a character or location, add an \`involves\` / \`located-at\` edge. When you plant a setup, add a \`foreshadows\` edge to its payoff (or a backlog idea if the payoff doesn't exist yet).
- Before making creative suggestions, check for contradictions with established facts.
- Offer 2-3 distinct options for big creative decisions, and recommend one.`,
  },
  {
    id: 'character',
    title: 'Characters',
    scope: 'all',
    body: `- Every major character has a **want** (external goal), a **need** (internal truth they lack) and a **flaw** or wound that stands between them.
- Characters reveal themselves through choices under pressure, not through descriptions of their traits.
- The antagonist believes they are right. Give them a coherent goal and good reasons.
- Give each character a distinct voice: rhythm, vocabulary, what they avoid saying.
- Track arcs: where does the character start, what forces change, where do they end (or fail to change, tragically)?
- Supporting characters need their own want, even if it's small.`,
  },
  {
    id: 'scene',
    title: 'Scenes',
    scope: 'all',
    body: `- Every scene needs a **goal** (someone wants something), **conflict** (something opposes it) and an **outcome** that changes the situation (a turn). If nothing changes, cut it or merge it.
- Structure options: Goal → Conflict → Disaster, followed by a sequel of Reaction → Dilemma → Decision.
- Enter late, leave early. Start in motion and end on a hook or open question.
- Ground the reader quickly: who, where, when, within the first lines.
- Write a one-line scene summary in the \`summary\` field: "X tries to Y, but Z, so now W."`,
  },
  {
    id: 'structure',
    title: 'Story structure',
    scope: 'all',
    body: `- Three-act, Save the Cat, Hero's Journey, Story Circle and Kishōtenketsu are lenses to diagnose problems, not templates to fill in.
- Key beats to check: inciting incident (~10-15%), point of no return (~25%), midpoint reversal (~50%), all-is-lost (~75%), climax, resolution.
- Each chapter should end with the situation different from how it began.
- Escalate: each obstacle is harder, costlier or more personal than the last.
- The climax should test the protagonist's flaw/need, not just their skills.`,
  },
  {
    id: 'stakes-tension',
    title: 'Stakes, tension and pacing',
    scope: 'all',
    body: `- Make the stakes clear and concrete. Personal stakes beat global stakes. Ideally have both.
- Tension = uncertainty + caring. Make the reader care before you threaten.
- Alternate tension and release. Vary scene length and intensity.
- Use dramatic irony (the reader knows more than the character) to build suspense.
- Ticking clocks and deadlines compress pacing. Use them deliberately.`,
  },
  {
    id: 'setup-payoff',
    title: 'Setup and payoff',
    scope: 'all',
    body: `- Every significant setup needs a payoff (Chekhov's gun), and every payoff needs a setup.
- Record them as \`foreshadows\` edges from setup to payoff.
- Plant setups early and casually. Pay them off at moments of maximum pressure.
- When reviewing, list any dangling setups or unearned payoffs.`,
  },
  {
    id: 'prose',
    title: 'Prose and dialogue',
    scope: 'all',
    body: `- Show, don't tell, unless telling is faster and the moment doesn't matter.
- Specific concrete details beat generic adjectives. Use one striking detail, not five.
- Prefer strong verbs to adverbs. Cut filler (very, just, really, suddenly).
- Dialogue is action: characters want things in every exchange. Use subtext. People rarely say exactly what they mean.
- Plain "said" tags are fine. Action beats can replace tags.
- Keep POV discipline: no head-hopping within a scene.`,
  },
  {
    id: 'theme',
    title: 'Theme',
    scope: 'all',
    body: `- Theme comes out of conflict between values. Don't preach. Let opposing views collide and both have force.
- Theme is often posed as a question the story explores ("Is loyalty worth more than truth?").
- Echo the theme in subplots and minor characters through variations and contrasts.`,
  },
  {
    id: 'worldbuilding',
    title: 'Worldbuilding and consistency',
    scope: 'all',
    body: `- Establish rules (magic, tech, politics) and respect them. Limitations are more interesting than powers.
- Iceberg principle: know more than you show, and reveal it only when it matters to the scene.
- Locations have mood, sensory details, and someone who wants something there.
- Factions have a goal, resources, a method and a rival.
- Before writing, check existing entities for names, dates and facts. Keep entity notes up to date with new canon.`,
  },
  {
    id: 'rpg-prep',
    title: 'RPG campaign prep',
    scope: 'rpg',
    body: `- **Prepare situations, not plots.** Players will derail you. Prepare factions with goals, NPCs with wants, and progress clocks, not fixed sequences.
- **Three-clue rule:** every conclusion the players must reach has at least three clues.
- **Strong start:** each session opens with action or a compelling hook.
- Use scenes as flexible encounters/situations. Use \`branches-to\` edges for player choices.
- Keep prep skimmable: bullets, bold key names, read-aloud text in blockquotes.
- Plan the consequences: when players act, the world reacts. Log it in the relevant entity notes.
- Secrets and clues: keep a list of ~10 per session that can surface anywhere.`,
  },
  {
    id: 'rpg-npc',
    title: 'NPCs, locations and encounters',
    scope: 'rpg',
    body: `- NPC: name, one-line role, want, a distinctive hook (voice/mannerism/look), what they know, and how they react to the party. Keep it to about 5 lines.
- Location: first impression (read-aloud), what's here, who's here, what happens if poked, exits/connections.
- Encounter: why it's happening, what the opposition wants, terrain or twist, how it can end besides combat.
- Give real choices with visible consequences. Avoid illusionism.`,
  },
  {
    id: 'screenplay',
    title: 'Screenplay',
    scope: 'screenplay',
    body: `- Write only what can be seen or heard. Keep action lines lean: 3-4 lines per paragraph at most.
- Enter late, leave early. Every scene earns its place.
- Dialogue carries subtext. Cut anything an actor could convey with a look.
- Roughly one page per minute. A feature runs about 90-120 pages.
- Visual motifs carry theme.`,
  },
  {
    id: 'revision',
    title: 'Revision checklist',
    scope: 'all',
    body: `- Does every scene have a goal, conflict and turn?
- Are the protagonist's want, need and flaw clear by the end of act one?
- Do stakes escalate? Is the midpoint a real reversal?
- Are there dangling setups, unearned payoffs or contradictions with established facts?
- Is the pacing varied? Are there sagging stretches with no change?
- Does the ending resolve the central dramatic question and the theme?`,
  },
]
