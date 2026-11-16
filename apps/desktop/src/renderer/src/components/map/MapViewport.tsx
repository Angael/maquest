import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  cellCenter,
  cellOf,
  explore,
  formatDistance,
  isShaped,
  lineMeasure,
  localBox,
  nearestWall,
  pathCells,
  renderMap,
  simplify,
  sight as computeSight,
  toLocal,
  toWorld,
  traceCell,
  transformOf,
  worldBox,
  pointsD,
  type MapDoc,
  type MapObject,
  type Pair,
  type PathPoint,
  type Point,
  type Token,
} from '@maquest/core/map'
import { api, mediaUrl } from '../../lib/api'
import { toReact } from './svgReact'
import { moveSnap, snapOf, useMapUI } from './mapStore'
import { addObject, addToken, moveIds, patchObject, removeIds, snapPoint, snapTo, snapToken, withExplored } from './edit'

type View = { x: number; y: number; s: number }

type Gesture =
  | { type: 'pan'; start: Point; view: View }
  | { type: 'move'; ids: string[]; start: Point; base: MapDoc; moved: boolean }
  | { type: 'rotate'; id: string; base: MapDoc }
  | { type: 'resize'; id: string; corner: number; base: MapDoc }
  | { type: 'vertex'; id: string; index: number; part: 'pt' | 'in' | 'out'; base: MapDoc }
  | { type: 'shape'; start: Point }
  | { type: 'freehand'; points: Point[] }
  | { type: 'pen'; index: number }
  | { type: 'ruler' }
  | { type: 'marquee'; start: Point; add: boolean }
  | { type: 'erase'; ids: Set<string>; base: MapDoc; broad: boolean }
  | { type: 'radius'; id: string; field: RadiusField; base: MapDoc }
  | { type: 'doorEnd'; id: string; side: -1 | 1; base: MapDoc }

/** What a ring handle on the map changes. */
type RadiusField = 'size' | 'vision' | 'darkvision' | 'bright' | 'dim'

type Pen = { kind: 'room' | 'area' | 'wall' | 'path'; points: PathPoint[] }
type Ruler = { mode: 'line' | 'cells'; start: Point; end: Point; cells: Pair[] }

const ACCENT = 'var(--color-accent)'
const PEN_KINDS = { room: 'room', area: 'area', wall: 'wall', path: 'path' } as const

export function MapViewport({ doc, commit, mapId }: { doc: MapDoc; commit: (next: MapDoc) => void; mapId: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View | null>(null)
  const [preview, setPreview] = useState<MapDoc | null>(null)
  const [pen, setPen] = useState<Pen | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [ruler, setRuler] = useState<Ruler | null>(null)
  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null)
  const [drawing, setDrawing] = useState<{ a: Point; b: Point } | null>(null)
  const [stroke, setStroke] = useState<Point[] | null>(null)
  const [spacePan, setSpacePan] = useState(false)
  const [eraseHover, setEraseHover] = useState<string | null>(null)
  const gesture = useRef<Gesture | null>(null)
  /** The latest `cancel`, for the key handler. */
  const cancelRef = useRef<() => boolean>(() => false)
  const ui = useMapUI(
    useShallow((s) => ({
      tool: s.tool,
      shape: s.shape,
      op: s.op,
      roomOp: s.roomOp,
      tokenKind: s.tokenKind,
      fill: s.fill,
      stroke: s.stroke,
      ruler: s.ruler,
      viewMode: s.viewMode,
      image: s.image,
      selected: s.selected,
      activeLayer: s.activeLayer,
    })),
  )
  const select = useMapUI((s) => s.select)
  const shown = preview ?? doc

  const scene = useMemo(
    () =>
      renderMap(shown, {
        mode: ui.viewMode === 'player' ? 'export' : 'edit',
        imageHref: mediaUrl,
        fog: ui.viewMode,
        lighting: ui.viewMode,
        idPrefix: `ed-${mapId}-`,
        // The GM sees (and can grab) things left outside the map; the players never do.
        clip: ui.viewMode === 'player',
      }),
    [shown, ui.viewMode, mapId],
  )
  const content = useMemo(() => scene.svg.children.map((c, i) => toReact(c, i)), [scene])

  // Fit the map into the viewport on open and when its size changes.
  const fit = useCallback(() => {
    const r = host.current?.getBoundingClientRect()
    if (!r?.width) return
    // Keep clear of the floating toolbars: the top bar and the tool rail on the left.
    const top = 60
    const left = 64
    const w = r.width - left - 24
    const h = r.height - top - 24
    const s = Math.min(w / doc.grid.cols, h / doc.grid.rows)
    setView({ s, x: left + (w - doc.grid.cols * s) / 2, y: top + (h - doc.grid.rows * s) / 2 })
  }, [doc.grid.cols, doc.grid.rows])
  useEffect(() => {
    fit()
  }, [fit])
  useEffect(() => {
    const listener = () => fit()
    window.addEventListener('maquest:map-fit', listener)
    return () => window.removeEventListener('maquest:map-fit', listener)
  }, [fit])

  const v = view ?? { x: 0, y: 0, s: 30 }
  const px = (n: number) => n / v.s
  const toMap = (e: { clientX: number; clientY: number }): Point => {
    const r = host.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - v.x) / v.s, y: (e.clientY - r.top - v.y) / v.s }
  }
  /** The snap step of what a gesture drags. */
  const gestureStep = (g: Gesture, e: { ctrlKey: boolean; metaKey: boolean }) => {
    if (g.type === 'move') return flip(moveSnap(g.base, g.ids), e)
    if (g.type === 'radius') return step(g.base.tokens.some((t) => t.id === g.id) ? 'token' : 'light', e)
    if (g.type === 'doorEnd') return step('door', e)
    if (g.type === 'resize' || g.type === 'vertex') return step(g.base.objects.find((o) => o.id === g.id)?.kind ?? '', e)
    return step(tool, e)
  }

  // Wheel zooms around the cursor (pinch arrives as ctrl+wheel).
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setView((cur) => {
        const c = cur ?? { x: 0, y: 0, s: 30 }
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
        const s = Math.min(400, Math.max(2, c.s * factor))
        const mx = e.clientX - r.left
        const my = e.clientY - r.top
        return { s, x: mx - ((mx - c.x) / c.s) * s, y: my - ((my - c.y) / c.s) * s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const finishPen = useCallback(
    (closed: boolean) => {
      if (!pen) return
      const pts = pen.points
      const needsClosed = pen.kind === 'room' || pen.kind === 'area'
      const close = closed || needsClosed
      if (pts.length < (close ? 3 : 2)) {
        setPen(null)
        return
      }
      const o = pts[0]
      const shape = { type: 'path' as const, closed: close, points: pts.map((p) => ({ ...p, x: p.x - o.x, y: p.y - o.y })) }
      const st = useMapUI.getState()
      const base = { x: o.x, y: o.y, shape }
      const input =
        pen.kind === 'room'
          ? { kind: 'room' as const, ...base, op: st.roomOp, light: st.roomLight ?? undefined }
          : pen.kind === 'area'
            ? { kind: 'area' as const, ...base, op: st.op, fill: st.fill }
            : pen.kind === 'wall'
              ? { kind: 'wall' as const, ...base }
              : { kind: 'path' as const, ...base, stroke: st.stroke }
      const r = addObject(doc, input, st.activeLayer)
      commit(r.doc)
      select([r.id])
      setPen(null)
    },
    [pen, doc, commit, select],
  )

  // Keys that belong to the viewport's in-progress drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === ' ' && !e.repeat) setSpacePan(true)
      if (pen && e.key === 'Enter') {
        e.preventDefault()
        finishPen(false)
      } else if (e.key === 'Escape' && (pen || ruler || gesture.current)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        cancelRef.current()
      } else if (pen && e.key === 'Backspace') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setPen((p) => (p && p.points.length > 1 ? { ...p, points: p.points.slice(0, -1) } : null))
      }
    }
    const onUp = (e: KeyboardEvent) => e.key === ' ' && setSpacePan(false)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onUp)
    }
  }, [pen, ruler, finishPen])

  // A different tool drops what the old one was drawing.
  useEffect(
    () =>
      useMapUI.subscribe((state, prev) => {
        if (state.tool === prev.tool) return
        setPen(null)
        setDrawing(null)
        if (state.tool !== 'ruler') setRuler(null)
      }),
    [],
  )

  const tool = spacePan ? 'pan' : ui.tool
  const selectedObject = ui.selected.length === 1 ? shown.objects.find((o) => o.id === ui.selected[0]) : undefined
  const selectedToken = ui.selected.length === 1 ? shown.tokens.find((t) => t.id === ui.selected[0]) : undefined

  /** Drops whatever is being drawn or dragged (right click, Esc): nothing is saved. */
  const cancel = () => {
    const had = !!(gesture.current || pen || ruler)
    gesture.current = null
    setPen(null)
    setPreview(null)
    setDrawing(null)
    setStroke(null)
    setMarquee(null)
    setRuler(null)
    return had
  }

  useEffect(() => {
    cancelRef.current = cancel
  })

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // A right click cancels the line, shape or drag in progress.
    if (e.button === 2) {
      cancel()
      return
    }
    if (gesture.current) return
    host.current?.focus()
    const p = toMap(e)
    const target = e.target instanceof Element ? e.target : null
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.button === 1 || tool === 'pan') {
      gesture.current = { type: 'pan', start: { x: e.clientX, y: e.clientY }, view: v }
      return
    }
    const handle = target?.closest('[data-handle]')?.getAttribute('data-handle')
    const handleOwner = selectedObject ?? selectedToken
    if (handle && handleOwner) {
      const [kind, n] = handle.split('-')
      if (kind === 'radius') gesture.current = { type: 'radius', id: handleOwner.id, field: n as RadiusField, base: doc }
      else if (kind === 'door') gesture.current = { type: 'doorEnd', id: handleOwner.id, side: n === 'a' ? -1 : 1, base: doc }
      else if (!selectedObject) return
      else if (kind === 'rotate') gesture.current = { type: 'rotate', id: selectedObject.id, base: doc }
      else if (kind === 'resize') gesture.current = { type: 'resize', id: selectedObject.id, corner: Number(n), base: doc }
      else gesture.current = { type: 'vertex', id: selectedObject.id, index: Number(n), part: kind as 'pt' | 'in' | 'out', base: doc }
      return
    }
    const s = step(tool, e)
    switch (tool) {
      case 'select': {
        const id = target?.closest('[data-token]')?.getAttribute('data-token') ?? target?.closest('[data-id]')?.getAttribute('data-id')
        if (id) {
          const already = ui.selected.includes(id)
          const ids = e.shiftKey ? (already ? ui.selected.filter((x) => x !== id) : [...ui.selected, id]) : already ? ui.selected : [id]
          select(ids)
          if (ids.includes(id)) gesture.current = { type: 'move', ids, start: p, base: doc, moved: false }
        } else if (!e.shiftKey && ui.selected.some((sid) => insideBox(doc, sid, p))) {
          // Grab a selection by its box too (thin lines, things outside the map, a group of several).
          gesture.current = { type: 'move', ids: ui.selected, start: p, base: doc, moved: false }
        } else {
          if (!e.shiftKey) select([])
          gesture.current = { type: 'marquee', start: p, add: e.shiftKey }
        }
        return
      }
      case 'room':
      case 'area':
        if (ui.shape === 'polygon') return penDown(PEN_KINDS[tool], snapPoint(p, s))
        if (ui.shape === 'freehand') {
          gesture.current = { type: 'freehand', points: [p] }
          setStroke([p])
          return
        }
        gesture.current = { type: 'shape', start: snapPoint(p, s) }
        setDrawing({ a: snapPoint(p, s), b: snapPoint(p, s) })
        return
      case 'wall':
      case 'path':
        return penDown(PEN_KINDS[tool], snapPoint(p, s))
      case 'brush':
        gesture.current = { type: 'freehand', points: [p] }
        setStroke([p])
        return
      case 'door': {
        const at = doorSpot(p, s)
        const r = addObject(doc, { kind: 'door', ...at }, ui.activeLayer)
        commit(r.doc)
        select([r.id])
        return
      }
      case 'image': {
        if (!ui.image) return
        const src = ui.image
        const at = snapPoint(p, s)
        const img = new Image()
        img.addEventListener('load', () => {
          const w = Math.min(doc.grid.cols, Math.max(1, img.naturalWidth / doc.grid.size))
          const h = (w * img.naturalHeight) / Math.max(1, img.naturalWidth)
          const r = addObject(doc, { kind: 'image', src, ...at, w, h }, ui.activeLayer)
          commit(r.doc)
          select([r.id])
        })
        img.src = mediaUrl(src)
        return
      }
      case 'label': {
        const r = addObject(doc, { kind: 'label', ...snapPoint(p, s), text: 'Label' }, ui.activeLayer)
        commit(r.doc)
        select([r.id])
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-map-field="text"]')?.select())
        return
      }
      case 'light': {
        const r = addObject(doc, { kind: 'light', ...snapPoint(p, s) }, ui.activeLayer)
        commit(r.doc)
        select([r.id])
        return
      }
      case 'token': {
        const r = addToken(doc, p, ui.activeLayer, ui.tokenKind, !s)
        commit(withExplored(r.doc))
        select([r.id])
        return
      }
      case 'ruler':
        gesture.current = { type: 'ruler' }
        setRuler({ mode: ui.ruler, start: p, end: p, cells: [cellOf(p)] })
        return
      case 'eraser': {
        const hit = hitAt(e.clientX, e.clientY, true)
        const g: Gesture = { type: 'erase', ids: new Set(), base: doc, broad: !!hit && isBroad(doc, hit) }
        gesture.current = g
        if (hit) {
          g.ids.add(hit)
          setPreview(removeIds(doc, [...g.ids]))
          setEraseHover(null)
        }
        return
      }
    }
  }

  /** The topmost object or token under a screen point (pointer capture hides it from event targets). */
  function hitAt(x: number, y: number, broad: boolean): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!host.current?.contains(el)) continue
      if (el.closest('[data-handle]')) continue
      const id = el.closest('[data-token]')?.getAttribute('data-token') ?? el.closest('[data-id]')?.getAttribute('data-id')
      if (!id) continue
      if (!broad && isBroad(doc, id)) continue
      return id
    }
    return null
  }

  function penDown(kind: Pen['kind'], p: Point) {
    const first = pen?.points[0]
    if (pen && first && pen.points.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) < Math.max(0.25, px(10))) {
      finishPen(true)
      return
    }
    const points = pen && pen.kind === kind ? [...pen.points, { x: p.x, y: p.y }] : [{ x: p.x, y: p.y }]
    setPen({ kind, points })
    gesture.current = { type: 'pen', index: points.length - 1 }
  }

  function doorSpot(p: Point, s: number) {
    const near = nearestWall(scene.geometry, p, 1)
    if (!near) return { ...snapPoint(p, s ? 0.5 : 0), rotation: 0 }
    const rad = (near.rotation * Math.PI) / 180
    let { x, y } = near
    // Center doors in a cell along straight walls.
    if (s && Math.abs(Math.sin(rad)) < 0.05) x = Math.floor(x) + 0.5
    if (s && Math.abs(Math.cos(rad)) < 0.05) y = Math.floor(y) + 0.5
    return { x, y, rotation: Math.round(near.rotation * 100) / 100 }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    // A right press while dragging (no pointerdown fires for a second button) cancels the drag.
    if (e.buttons & 2 && gesture.current && gesture.current.type !== 'pan') {
      cancel()
      return
    }
    const p = toMap(e)
    setCursor(p)
    const g = gesture.current
    if (!g) {
      if (tool === 'eraser') setEraseHover(hitAt(e.clientX, e.clientY, true))
      return
    }
    const s = gestureStep(g, e)
    switch (g.type) {
      case 'erase': {
        const hit = hitAt(e.clientX, e.clientY, g.broad)
        if (hit && !g.ids.has(hit)) {
          g.ids.add(hit)
          setPreview(removeIds(g.base, [...g.ids]))
        }
        return
      }
      case 'radius': {
        const o = g.base.objects.find((x) => x.id === g.id)
        const t = g.base.tokens.find((x) => x.id === g.id)
        const c = o ?? t
        if (!c) return
        const dist = Math.hypot(p.x - c.x, p.y - c.y)
        if (g.field === 'size') {
          // The handle sits on the token's corner: half the footprint along the diagonal.
          const raw = (dist / Math.SQRT2) * 2
          const size = Math.max(0.25, s ? Math.max(0.5, Math.round(raw * 2) / 2) : Math.round(raw * 100) / 100)
          setPreview(patchObject(g.base, g.id, { size }))
          return
        }
        const v = Math.max(0, s ? Math.round(dist / Math.max(0.5, s)) * Math.max(0.5, s) : Math.round(dist * 100) / 100)
        setPreview(patchObject(g.base, g.id, { [g.field]: g.field === 'darkvision' && !v ? undefined : v }))
        return
      }
      case 'doorEnd': {
        const o = g.base.objects.find((x) => x.id === g.id)
        if (o?.kind !== 'door') return
        const other = toWorld(o, { x: (-g.side * o.width) / 2, y: 0 })
        const local = toLocal(o, p)
        const along = s ? Math.round(local.x / (s / 2)) * (s / 2) : local.x
        const end = toWorld(o, { x: along, y: 0 })
        const width = Math.max(0.25, Math.abs(along + (g.side * o.width) / 2))
        setPreview(patchObject(g.base, g.id, { width, x: (other.x + end.x) / 2, y: (other.y + end.y) / 2 }))
        return
      }
      case 'pan':
        setView({ ...g.view, x: g.view.x + e.clientX - g.start.x, y: g.view.y + e.clientY - g.start.y })
        return
      case 'move': {
        const dx = snapTo(p.x - g.start.x, s)
        const dy = snapTo(p.y - g.start.y, s)
        if (!dx && !dy && !g.moved) return
        g.moved = true
        let next = moveIds(g.base, g.ids, dx, dy, !!s)
        // Dragging a player token reveals what it sees along the way.
        if (next.fog.enabled && g.ids.some((id) => next.tokens.find((t) => t.id === id)?.player)) {
          const explored = explore((preview ?? g.base).fog.explored, computeSight(next).visible)
          next = { ...next, fog: { ...next.fog, explored } }
        }
        setPreview(next)
        return
      }
      case 'rotate': {
        const o = g.base.objects.find((x) => x.id === g.id)!
        let deg = (Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI + 90
        if (!(e.ctrlKey || e.metaKey)) deg = Math.round(deg / 15) * 15
        deg = ((deg % 360) + 360) % 360
        setPreview(replace(g.base, { ...o, rotation: deg }))
        return
      }
      case 'resize': {
        const o = g.base.objects.find((x) => x.id === g.id)!
        const b = localBox(o)
        const corners = [
          { x: b.x, y: b.y },
          { x: b.x + b.w, y: b.y },
          { x: b.x + b.w, y: b.y + b.h },
          { x: b.x, y: b.y + b.h },
        ]
        const fixed = corners[(g.corner + 2) % 4]
        const local = toLocal(o, snapPoint(p, s && !o.rotation ? s : 0))
        const w = Math.max(0.1, Math.abs(local.x - fixed.x))
        const h = Math.max(0.1, Math.abs(local.y - fixed.y))
        const center = toWorld(o, { x: (local.x + fixed.x) / 2, y: (local.y + fixed.y) / 2 })
        setPreview(replace(g.base, resized(o, w, h, center)))
        return
      }
      case 'vertex': {
        const o = g.base.objects.find((x) => x.id === g.id)!
        if (!isShaped(o) || o.shape.type !== 'path') return
        const local = toLocal(o, g.part === 'pt' ? snapPoint(p, s && !o.rotation ? s : 0) : p)
        const points = o.shape.points.map((pt, i) => {
          if (i !== g.index) return pt
          if (g.part === 'pt') return { ...pt, x: local.x, y: local.y }
          const rel = { x: local.x - pt.x, y: local.y - pt.y }
          const mirror = { x: -rel.x, y: -rel.y }
          // Alt breaks the handle pair; otherwise the opposite handle mirrors for a smooth curve.
          return g.part === 'out' ? { ...pt, out: rel, ...(e.altKey ? {} : { in: mirror }) } : { ...pt, in: rel, ...(e.altKey ? {} : { out: mirror }) }
        })
        setPreview(replace(g.base, { ...o, shape: { ...o.shape, points } }))
        return
      }
      case 'shape':
        setDrawing({ a: g.start, b: snapPoint(p, s) })
        return
      case 'freehand':
        g.points.push(p)
        setStroke([...g.points])
        return
      case 'pen':
        setPen((cur) => {
          if (!cur) return cur
          const pt = cur.points[g.index]
          const out = { x: p.x - pt.x, y: p.y - pt.y }
          if (Math.hypot(out.x, out.y) < 0.15) return cur
          const points = cur.points.map((q, i) => (i === g.index ? { ...q, out, in: { x: -out.x, y: -out.y } } : q))
          return { ...cur, points }
        })
        return
      case 'ruler':
        setRuler((r) => (r ? { ...r, end: p, cells: traceCell(r.cells, cellOf(p)) } : r))
        return
      case 'marquee':
        setMarquee({ a: g.start, b: p })
        return
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    const st = useMapUI.getState()
    switch (g.type) {
      case 'move':
        if (g.moved && preview) commit(withExplored(preview))
        break
      case 'erase':
        if (g.ids.size) {
          commit(removeIds(g.base, [...g.ids]))
          select(st.selected.filter((id) => !g.ids.has(id)))
        }
        break
      case 'radius': {
        if (!preview) break
        let next = preview
        // A resized token re-snaps so its footprint covers whole cells.
        const t = g.field === 'size' ? next.tokens.find((x) => x.id === g.id) : undefined
        if (t && step('token', e)) next = patchObject(next, t.id, snapToken(t, t.size))
        commit(next.tokens.some((x) => x.id === g.id && x.player) ? withExplored(next) : next)
        break
      }
      case 'rotate':
      case 'resize':
      case 'vertex':
      case 'doorEnd':
        if (preview) commit(preview)
        break
      case 'shape': {
        const a = g.start
        const b = drawing?.b ?? a
        setDrawing(null)
        let w = Math.abs(b.x - a.x)
        let h = Math.abs(b.y - a.y)
        if (e.shiftKey) w = h = Math.max(w, h)
        if (w < 0.1 || h < 0.1) break
        const center = { x: a.x + (Math.sign(b.x - a.x) * w) / 2, y: a.y + (Math.sign(b.y - a.y) * h) / 2 }
        const shape = st.shape === 'ellipse' ? { type: 'ellipse' as const, rx: w / 2, ry: h / 2 } : { type: 'rect' as const, w, h }
        const r = addObject(
          doc,
          ui.tool === 'room'
            ? { kind: 'room', ...center, shape, op: altOp(st.roomOp, e.altKey), light: st.roomLight ?? undefined }
            : { kind: 'area', ...center, shape, op: altOp(st.op, e.altKey), fill: st.fill },
          st.activeLayer,
        )
        commit(r.doc)
        select([r.id])
        break
      }
      case 'freehand': {
        setStroke(null)
        const pts = simplify(g.points, Math.max(0.03, px(1.5)))
        if (pts.length < 2) break
        const o = pts[0]
        const points = pts.map((q) => ({ x: Math.round((q.x - o.x) * 100) / 100, y: Math.round((q.y - o.y) * 100) / 100 }))
        const r =
          ui.tool === 'brush'
            ? addObject(doc, { kind: 'path', x: o.x, y: o.y, shape: { type: 'path', points, closed: false }, stroke: st.stroke }, st.activeLayer)
            : points.length >= 3
              ? addObject(
                  doc,
                  ui.tool === 'room'
                    ? {
                        kind: 'room',
                        x: o.x,
                        y: o.y,
                        shape: { type: 'path', points, closed: true },
                        op: altOp(st.roomOp, e.altKey),
                        light: st.roomLight ?? undefined,
                      }
                    : { kind: 'area', x: o.x, y: o.y, shape: { type: 'path', points, closed: true }, op: altOp(st.op, e.altKey), fill: st.fill },
                  st.activeLayer,
                )
              : null
        if (r) {
          commit(r.doc)
          if (ui.tool !== 'brush') select([r.id])
        }
        break
      }
      case 'marquee': {
        const m = marquee
        setMarquee(null)
        if (!m) break
        const x0 = Math.min(m.a.x, m.b.x)
        const x1 = Math.max(m.a.x, m.b.x)
        const y0 = Math.min(m.a.y, m.b.y)
        const y1 = Math.max(m.a.y, m.b.y)
        const hits = [
          ...doc.objects.filter((o) => {
            const b = worldBox(o)
            return b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1
          }),
          ...doc.tokens.filter((t) => t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1),
        ].map((o) => o.id)
        select(g.add ? [...new Set([...st.selected, ...hits])] : hits)
        break
      }
    }
    setPreview(null)
  }

  // Dropping image files imports them into media/ and places them.
  const onDrop = async (e: DragEvent) => {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    const p = toMap(e)
    let next = doc
    const ids: string[] = []
    for (const [i, file] of files.entries()) {
      const src = await api.importMedia(window.maquest.pathForFile(file))
      const bitmap = await createImageBitmap(file).catch(() => null)
      const w = Math.min(doc.grid.cols, Math.max(1, (bitmap?.width ?? doc.grid.size * 4) / doc.grid.size))
      const h = bitmap ? (w * bitmap.height) / bitmap.width : w
      const r = addObject(next, { kind: 'image', src, x: p.x + i, y: p.y + i, w, h }, useMapUI.getState().activeLayer)
      next = r.doc
      ids.push(r.id)
    }
    commit(next)
    select(ids)
  }

  const cursorStyle = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : tool === 'eraser' ? (eraseHover ? 'pointer' : 'cell') : 'crosshair'

  return (
    <div
      ref={host}
      tabIndex={-1}
      data-map-viewport
      className="absolute inset-0 overflow-hidden bg-app outline-none select-none"
      style={{ cursor: cursorStyle, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => {
        // Right click while drawing or dragging with the left button held: pointerdown only fires for the first button.
        if (e.button === 2 && (gesture.current || pen || ruler || drawing || stroke)) cancel()
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setCursor(null)
        setEraseHover(null)
      }}
      onDoubleClick={(e) => {
        if (pen) return finishPen(false)
        // Double-clicking a door opens or closes it.
        const id = tool === 'select' && e.target instanceof Element ? e.target.closest('[data-kind="door"]')?.getAttribute('data-id') : null
        const d = id ? doc.objects.find((o) => o.id === id) : undefined
        if (d?.kind === 'door') commit(withExplored(patchObject(doc, d.id, { open: !d.open })))
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => void onDrop(e)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {view && (
        <svg className="absolute inset-0 h-full w-full" role="img" aria-label="Map">
          <g transform={`translate(${v.x} ${v.y}) scale(${v.s})`}>
            {/* Map frame shadow so the map edge reads against the app background. */}
            <rect width={doc.grid.cols} height={doc.grid.rows} fill="none" stroke="black" strokeOpacity={0.5} strokeWidth={px(1)} />
            {content}
            {ui.viewMode === 'gm' && <Outside cols={doc.grid.cols} rows={doc.grid.rows} />}
            <Overlays
              doc={shown}
              px={px}
              selected={ui.selected}
              selectedObject={ui.viewMode === 'gm' ? selectedObject : undefined}
              selectedToken={ui.viewMode === 'gm' && tool !== 'eraser' ? selectedToken : undefined}
              eraseHover={tool === 'eraser' ? eraseHover : null}
              pen={pen}
              cursor={cursor}
              drawing={drawing && { ...drawing, ellipse: ui.shape === 'ellipse', subtract: (ui.tool === 'room' ? ui.roomOp : ui.op) === 'subtract' }}
              stroke={stroke && { points: stroke, brush: ui.tool === 'brush', width: ui.stroke.width }}
              marquee={marquee}
              ruler={ruler}
              doorGhost={tool === 'door' && cursor ? doorSpot(cursor, snapOf('door')) : null}
            />
          </g>
        </svg>
      )}
    </div>
  )
}

const flip = (base: number, e: { ctrlKey: boolean; metaKey: boolean }) => (e.ctrlKey || e.metaKey ? (base ? 0 : 1) : base)
/** A tool's snap step; Ctrl flips snapping off (or on, for tools that place freely). */
const step = (t: string, e: { ctrlKey: boolean; metaKey: boolean }) => flip(snapOf(t), e)

/** Alt flips adding and subtracting while drawing (a separate room becomes a cut). */
function altOp<T extends 'add' | 'subtract' | 'separate'>(op: T, alt: boolean): T | 'add' | 'subtract' {
  if (!alt) return op
  return op === 'subtract' ? 'add' : 'subtract'
}

/** Rooms and areas cover the map; the eraser only takes them when the stroke starts on one. */
function isBroad(d: MapDoc, id: string) {
  const kind = d.objects.find((o) => o.id === id)?.kind
  return kind === 'room' || kind === 'area'
}

/** Whether a point lies in an object's (rotated) box or a token's footprint. */
function insideBox(d: MapDoc, id: string, p: Point) {
  const o = d.objects.find((x) => x.id === id)
  if (o) {
    const b = localBox(o)
    const l = toLocal(o, p)
    const pad = 0.15
    return l.x >= b.x - pad && l.x <= b.x + b.w + pad && l.y >= b.y - pad && l.y <= b.y + b.h + pad
  }
  const t = d.tokens.find((x) => x.id === id)
  return !!t && Math.abs(p.x - t.x) <= t.size / 2 && Math.abs(p.y - t.y) <= t.size / 2
}

/** Dims everything outside the map's rectangle: the GM sees what lies there, players never do. */
function Outside({ cols, rows }: { cols: number; rows: number }) {
  const far = 1e5
  return (
    <path
      d={`M${-far} ${-far}H${far}V${far}H${-far}Z M0 0V${rows}H${cols}V0Z`}
      fill="var(--color-app)"
      fillOpacity={0.72}
      fillRule="evenodd"
      pointerEvents="none"
    />
  )
}

function replace(doc: MapDoc, o: MapObject): MapDoc {
  return { ...doc, objects: doc.objects.map((x) => (x.id === o.id ? o : x)) }
}

/** The object with a new local size, centered on `center`. */
function resized(o: MapObject, w: number, h: number, center: Point): MapObject {
  const at = { x: center.x, y: center.y }
  if (o.kind === 'image') return { ...o, ...at, w, h }
  // Labels keep their anchor; the box height is the text size.
  if (o.kind === 'label') return { ...o, size: Math.max(0.1, Math.round(h * 100) / 100) }
  if (!isShaped(o)) return o
  const s = o.shape
  if (s.type === 'rect') return { ...o, ...at, shape: { ...s, w, h } } as MapObject
  if (s.type === 'ellipse') return { ...o, ...at, shape: { ...s, rx: w / 2, ry: h / 2 } } as MapObject
  // Paths scale their points about the box.
  const b = localBox(o)
  const sx = w / b.w
  const sy = h / b.h
  const scale = (p: PathPoint): PathPoint => ({
    x: (p.x - b.x - b.w / 2) * sx,
    y: (p.y - b.y - b.h / 2) * sy,
    ...(p.in ? { in: { x: p.in.x * sx, y: p.in.y * sy } } : {}),
    ...(p.out ? { out: { x: p.out.x * sx, y: p.out.y * sy } } : {}),
  })
  return { ...o, ...at, shape: { ...s, points: s.points.map(scale), holes: s.holes?.map((r) => r.map(scale)) } } as MapObject
}

type OverlayProps = {
  doc: MapDoc
  px: (n: number) => number
  selected: string[]
  selectedObject?: MapObject
  selectedToken?: Token
  eraseHover: string | null
  pen: Pen | null
  cursor: Point | null
  drawing: { a: Point; b: Point; ellipse: boolean; subtract: boolean } | null
  stroke: { points: Point[]; brush: boolean; width: number } | null
  marquee: { a: Point; b: Point } | null
  ruler: Ruler | null
  doorGhost: { x: number; y: number; rotation: number } | null
}

function Overlays({ doc, px, selected, selectedObject, selectedToken, eraseHover, pen, cursor, drawing, stroke, marquee, ruler, doorGhost }: OverlayProps) {
  const thin = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1.5 }
  const boxes = selected.flatMap((id) => {
    const o = doc.objects.find((x) => x.id === id)
    if (o) {
      const b = localBox(o)
      const pad = px(3)
      return [
        <rect
          key={id}
          transform={transformOf(o)}
          x={b.x - pad}
          y={b.y - pad}
          width={b.w + pad * 2}
          height={b.h + pad * 2}
          fill="none"
          stroke={ACCENT}
          strokeDasharray="4 3"
          {...thin}
          pointerEvents="none"
        />,
      ]
    }
    const t = doc.tokens.find((x) => x.id === id)
    return t ? [<circle key={id} cx={t.x} cy={t.y} r={t.size * 0.42 + px(4)} fill="none" stroke={ACCENT} {...thin} pointerEvents="none" />] : []
  })
  const handle = px(5)
  let handles: ReactNode = null
  const o = selectedObject
  if (o && !o.locked) {
    const b = localBox(o)
    const rotY = b.y - px(22)
    const resizable = o.kind === 'image' || o.kind === 'label' || (isShaped(o) && o.kind !== 'wall') || (isShaped(o) && o.shape.type !== 'path')
    const path = isShaped(o) && o.shape.type === 'path' ? o.shape : null
    handles = (
      <g transform={transformOf(o)}>
        {o.kind !== 'light' && (
          <>
            <line x1={0} y1={b.y} x2={0} y2={rotY} stroke={ACCENT} {...thin} pointerEvents="none" />
            <circle data-handle="rotate" cx={0} cy={rotY} r={handle} fill="white" stroke={ACCENT} {...thin} style={{ cursor: 'grab' }} />
          </>
        )}
        {resizable &&
          !path &&
          [
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h],
            [b.x, b.y + b.h],
          ].map(([x, y], i) => (
            <rect
              key={i}
              data-handle={`resize-${i}`}
              x={x - handle}
              y={y - handle}
              width={handle * 2}
              height={handle * 2}
              fill="white"
              stroke={ACCENT}
              {...thin}
              style={{ cursor: i % 2 ? 'nesw-resize' : 'nwse-resize' }}
            />
          ))}
        {path &&
          path.points.map((p, i) => (
            <g key={i}>
              {(['in', 'out'] as const).map((side) => {
                const h = p[side]
                return h ? (
                  <g key={side}>
                    <line
                      x1={p.x}
                      y1={p.y}
                      x2={p.x + h.x}
                      y2={p.y + h.y}
                      stroke={ACCENT}
                      vectorEffect="non-scaling-stroke"
                      strokeWidth={1}
                      pointerEvents="none"
                    />
                    <circle data-handle={`${side}-${i}`} cx={p.x + h.x} cy={p.y + h.y} r={handle * 0.8} fill={ACCENT} style={{ cursor: 'move' }} />
                  </g>
                ) : null
              })}
              <rect
                data-handle={`pt-${i}`}
                x={p.x - handle}
                y={p.y - handle}
                width={handle * 2}
                height={handle * 2}
                fill="white"
                stroke={ACCENT}
                {...thin}
                style={{ cursor: 'move' }}
              />
            </g>
          ))}
        {o.kind === 'door' &&
          ([-1, 1] as const).map((side) => (
            <circle
              key={side}
              data-handle={`door-${side < 0 ? 'a' : 'b'}`}
              cx={(side * o.width) / 2}
              cy={0}
              r={handle}
              fill="white"
              stroke={ACCENT}
              {...thin}
              style={{ cursor: 'ew-resize' }}
            />
          ))}
      </g>
    )
    if (o.kind === 'light')
      handles = (
        <g>
          <RadiusHandle at={o} r={o.dim} angle={45} field="dim" label={`Dim ${formatDistance(o.dim, doc.grid)}`} color="#ffd27a" dashed px={px} />
          <RadiusHandle at={o} r={o.bright} angle={-45} field="bright" label={`Bright ${formatDistance(o.bright, doc.grid)}`} color="#ffd27a" px={px} />
        </g>
      )
  }
  const t = selectedToken
  if (t) {
    const half = t.size / 2
    const visionR = t.vision ?? half + px(70)
    const darkR = t.darkvision ?? 0
    handles = (
      <g>
        {t.vision !== undefined && <circle cx={t.x} cy={t.y} r={t.vision} fill={ACCENT} fillOpacity={0.04} pointerEvents="none" />}
        <RadiusHandle
          at={t}
          r={visionR}
          angle={160}
          field="vision"
          ring={t.vision !== undefined}
          label={t.vision === undefined ? 'Vision: unlimited (drag to limit)' : `Vision ${formatDistance(t.vision, doc.grid)}`}
          color={ACCENT}
          px={px}
        />
        <RadiusHandle
          at={t}
          r={Math.max(darkR, half + (darkR ? 0 : px(34)))}
          angle={-90}
          field="darkvision"
          ring={darkR > 0}
          label={darkR ? `Darkvision ${formatDistance(darkR, doc.grid)}` : 'Darkvision: none (drag)'}
          color="#a78bfa"
          dashed
          px={px}
        />
        <rect x={t.x - half} y={t.y - half} width={t.size} height={t.size} fill="none" stroke={ACCENT} strokeDasharray="4 3" {...thin} pointerEvents="none" />
        <rect
          data-handle="radius-size"
          x={t.x + half - handle}
          y={t.y + half - handle}
          width={handle * 2}
          height={handle * 2}
          fill="white"
          stroke={ACCENT}
          {...thin}
          style={{ cursor: 'nwse-resize' }}
        >
          <title>{`Size: ${t.size} cells`}</title>
        </rect>
      </g>
    )
  }
  let eraseMark: ReactNode = null
  if (eraseHover) {
    const eo = doc.objects.find((x) => x.id === eraseHover)
    const et = doc.tokens.find((x) => x.id === eraseHover)
    const red = { fill: '#dc2626', fillOpacity: 0.12, stroke: '#dc2626', ...thin, pointerEvents: 'none' as const }
    if (eo) {
      const b = localBox(eo)
      eraseMark = <rect transform={transformOf(eo)} x={b.x - px(3)} y={b.y - px(3)} width={b.w + px(6)} height={b.h + px(6)} {...red} />
    } else if (et) eraseMark = <circle cx={et.x} cy={et.y} r={et.size * 0.42 + px(4)} {...red} />
  }

  let penPreview: ReactNode = null
  if (pen) {
    const pts = cursor ? [...pen.points, { x: cursor.x, y: cursor.y }] : pen.points
    penPreview = (
      <g pointerEvents="none">
        <path d={pointsD(pts, false)} fill="none" stroke={ACCENT} {...thin} />
        {pen.points.map((p, i) => (
          <rect key={i} x={p.x - px(3)} y={p.y - px(3)} width={px(6)} height={px(6)} fill={i ? 'white' : ACCENT} stroke={ACCENT} {...thin} />
        ))}
      </g>
    )
  }

  return (
    <g>
      {boxes}
      {eraseMark}
      {handles}
      {penPreview}
      {drawing &&
        (() => {
          const x = Math.min(drawing.a.x, drawing.b.x)
          const y = Math.min(drawing.a.y, drawing.b.y)
          const w = Math.abs(drawing.b.x - drawing.a.x)
          const h = Math.abs(drawing.b.y - drawing.a.y)
          const color = drawing.subtract ? '#c2410c' : ACCENT
          return drawing.ellipse ? (
            <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={color} strokeDasharray="5 3" {...thin} pointerEvents="none" />
          ) : (
            <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeDasharray="5 3" {...thin} pointerEvents="none" />
          )
        })()}
      {stroke && (
        <polyline
          points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={ACCENT}
          strokeOpacity={stroke.brush ? 0.6 : 1}
          strokeWidth={stroke.brush ? stroke.width : px(1.5)}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {marquee && (
        <rect
          x={Math.min(marquee.a.x, marquee.b.x)}
          y={Math.min(marquee.a.y, marquee.b.y)}
          width={Math.abs(marquee.b.x - marquee.a.x)}
          height={Math.abs(marquee.b.y - marquee.a.y)}
          fill={ACCENT}
          fillOpacity={0.08}
          stroke={ACCENT}
          {...thin}
          pointerEvents="none"
        />
      )}
      {doorGhost && (
        <g transform={transformOf(doorGhost)} pointerEvents="none" opacity={0.7}>
          <rect x={-0.5} y={-0.12} width={1} height={0.24} fill="#8a5a2b" stroke={ACCENT} {...thin} />
        </g>
      )}
      {ruler && <RulerOverlay ruler={ruler} doc={doc} px={px} />}
    </g>
  )
}

/** A ring around a point with a handle on it; dragging the handle sets the ring's radius (see the `radius` gesture). */
function RadiusHandle({
  at,
  r,
  angle,
  field,
  label,
  color,
  dashed,
  ring = true,
  px,
}: {
  at: Point
  r: number
  angle: number
  field: string
  label: string
  color: string
  dashed?: boolean
  ring?: boolean
  px: (n: number) => number
}) {
  const a = (angle * Math.PI) / 180
  const hx = at.x + Math.cos(a) * r
  const hy = at.y + Math.sin(a) * r
  const thin = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1.5 }
  return (
    <g>
      {ring && r > 0 && (
        <circle cx={at.x} cy={at.y} r={r} fill="none" stroke={color} strokeDasharray={dashed ? '6 4' : undefined} {...thin} pointerEvents="none" />
      )}
      {!ring && <line x1={at.x} y1={at.y} x2={hx} y2={hy} stroke={color} strokeDasharray="3 3" {...thin} pointerEvents="none" />}
      <circle data-handle={`radius-${field}`} cx={hx} cy={hy} r={px(6)} fill={color} stroke="white" {...thin} style={{ cursor: 'grab' }}>
        <title>{label}</title>
      </circle>
      <text
        x={hx + px(10)}
        y={hy}
        dominantBaseline="central"
        fontSize={px(11)}
        fill="white"
        stroke="#1c1917"
        strokeWidth={px(3)}
        paintOrder="stroke"
        fontFamily="Inter, sans-serif"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  )
}

function RulerOverlay({ ruler, doc, px }: { ruler: Ruler; doc: MapDoc; px: (n: number) => number }) {
  const grid = doc.grid
  if (ruler.mode === 'line') {
    const m = lineMeasure(ruler.start, ruler.end, grid.diagonal)
    const a = cellCenter(cellOf(ruler.start))
    const b = cellCenter(cellOf(ruler.end))
    const label = `${formatDistance(m.cells, grid)} · ${(m.length * grid.unit.amount).toFixed(1)} ${grid.unit.name}`
    return (
      <g pointerEvents="none">
        <line x1={ruler.start.x} y1={ruler.start.y} x2={ruler.end.x} y2={ruler.end.y} stroke={ACCENT} strokeWidth={px(2.5)} strokeLinecap="round" />
        <circle cx={a.x} cy={a.y} r={px(4)} fill={ACCENT} />
        <circle cx={b.x} cy={b.y} r={px(4)} fill={ACCENT} />
        <Tag at={ruler.end} text={label} px={px} />
      </g>
    )
  }
  const cells = ruler.cells
  const total = pathCells(cells, grid.diagonal)
  const centers = cells.map(cellCenter)
  return (
    <g pointerEvents="none">
      {cells.map(([c, r], i) => (
        <rect key={i} x={c} y={r} width={1} height={1} fill={ACCENT} fillOpacity={0.18} />
      ))}
      <polyline
        points={centers.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={ACCENT}
        strokeWidth={px(2.5)}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {centers.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={px(i === 0 || i === centers.length - 1 ? 4 : 2)} fill={ACCENT} />
      ))}
      <Tag at={centers.at(-1)!} text={`${formatDistance(total, grid)} · ${Math.round(total * 10) / 10} cells`} px={px} />
    </g>
  )
}

function Tag({ at, text, px }: { at: Point; text: string; px: (n: number) => number }) {
  const fs = px(12)
  const w = text.length * fs * 0.58 + px(12)
  const h = px(20)
  return (
    <g transform={`translate(${at.x + px(12)} ${at.y - px(26)})`}>
      <rect width={w} height={h} rx={px(5)} fill="#1c1917" fillOpacity={0.92} />
      <text x={px(6)} y={h / 2} dominantBaseline="central" fontSize={fs} fill="white" fontFamily="Inter, sans-serif" className="tabular">
        {text}
      </text>
    </g>
  )
}
