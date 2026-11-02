import { create } from 'zustand'

/**
 * Pointer hover on the canvas (flow ids). Kept out of the canvas component so hovering never rebuilds the node and edge
 * arrays: each edge subscribes with a boolean selector and only the lines whose hover state flips re-render.
 */
export const useCanvasHover = create<{ edge: string | null; node: string | null }>(() => ({ edge: null, node: null }))

export const hoverEdge = (edge: string | null) => useCanvasHover.setState({ edge, node: null })
export const hoverNode = (node: string | null) => useCanvasHover.setState({ node, edge: null })
