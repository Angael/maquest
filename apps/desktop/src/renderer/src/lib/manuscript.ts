import { toast } from 'sonner'
import { api } from './api'

/** Saves a story, chapter or scene (with everything under it) as one markdown file, and says where it went. */
export async function exportManuscript(id: string) {
  try {
    const file = await api.exportManuscript(id)
    if (file) toast.success('Exported as Markdown', { description: file, action: { label: 'Show', onClick: () => void api.showPath(file) } })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
