import type { NodeType } from './schema'

/** Starter fields and body for new nodes of each type. */
export const TEMPLATES: Partial<Record<NodeType, { fields?: Record<string, string>; body: string }>> = {
  story: { body: '## Premise\n\n## Central question\n\n## Theme\n' },
  chapter: { body: '' },
  scene: {
    fields: { pov: '', goal: '', conflict: '', outcome: '' },
    body: '',
  },
  character: {
    fields: { role: '', want: '', need: '', flaw: '' },
    body: '## Appearance\n\n## Voice\n\n## Backstory\n\n## Arc\n',
  },
  location: {
    fields: { region: '', mood: '' },
    body: '## First impression\n\n## What is here\n\n## Who is here\n\n## Secrets\n',
  },
  faction: {
    fields: { goal: '', resources: '', method: '', rival: '' },
    body: '## Overview\n\n## Key members\n\n## Agenda\n',
  },
  item: {
    fields: { owner: '', origin: '' },
    body: '## Description\n\n## Properties\n\n## History\n',
  },
}
