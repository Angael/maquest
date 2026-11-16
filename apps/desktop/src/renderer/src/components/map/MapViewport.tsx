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
} from '@maquest/core/map'
import { api, mediaUrl } from '../../lib/api'
import { toReact } from './svgReact'
import { useMapUI } from './mapStore'
import { addObject, addToken, moveIds, snapPoint, snapTo, withExplored } from './edit'

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
  const gesture = useRef<Gesture | null>(null)
  const ui = useMapUI(
    useShallow((s) => ({
      tool: s.tool,
      shape: s.shape,
      op: s.op,
      snap: s.snap,
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
      }),
    [shown, ui.viewMode, mapId],
  )
  const content = useMemo(() => scene.svg.children.map((c, i) => toReact(c, i)), [scene])

  // Fit the map into the viewport on open and when its size changes.
  const fit = useCallback(() => {
    const r = host.current?.getBoundingClientRect()
    if (!r?.width) return
    const s = Math.min((r.width - 80) / doc.grid.cols, (r.height - 80) / doc.grid.rows)
    setView({ s, x: (r.width - doc.grid.cols * s) / 2, y: (r.height - doc.grid.rows * s) / 2 })
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
  const step = (e: { ctrlKey: boolean; metaKey: boolean }) => (e.ctrlKey || e.metaKey ? 0 : ui.snap)

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
          ? { kind: 'room' as const, ...base, op: st.op }
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
      } else if (pen && e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setPen(null)
      } else if (pen && e.key === 'Backspace') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setPen((p) => (p && p.points.length > 1 ? { ...p, points: p.points.slice(0, -1) } : null))
      } else if (ruler && e.key === 'Escape') {
        e.stopImmediatePropagation()
        setRuler(null)
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

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return
    host.current?.focus()
    const p = toMap(e)
    const target = e.target instanceof Element ? e.target : null
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.button === 1 || tool === 'pan') {
      gesture.current = { type: 'pan', start: { x: e.clientX, y: e.clientY }, view: v }
      return
    }
    const handle = target?.closest('[data-handle]')?.getAttribute('data-handle')
    if (handle && selectedObject) {
      const [kind, n] = handle.split('-')
      if (kind === 'rotate') gesture.current = { type: 'rotate', id: selectedObject.id, base: doc }
      else if (kind === 'resize') gesture.current = { type: 'resize', id: selectedObject.id, corner: Number(n), base: doc }
      else gesture.current = { type: 'vertex', id: selectedObject.id, index: Number(n), part: kind as 'pt' | 'in' | 'out', base: doc }
      return
    }
    const s = step(e)
    switch (tool) {
      case 'select': {
        const id = target?.closest('[data-token]')?.getAttribute('data-token') ?? target?.closest('[data-id]')?.getAttribute('data-id')
        if (id) {
          const already = ui.selected.includes(id)
          const ids = e.shiftKey ? (already ? ui.selected.filter((x) => x !== id) : [...ui.selected, id]) : already ? ui.selected : [id]
          select(ids)
          if (ids.includes(id)) gesture.current = { type: 'move', ids, start: p, base: doc, moved: false }
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
        const at = snapPoint(p, s ? 0.5 : 0)
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
        const r = addObject(doc, { kind: 'label', ...snapPoint(p, s ? 0.5 : 0), text: 'Label' }, ui.activeLayer)
        commit(r.doc)
        select([r.id])
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-map-field="text"]')?.select())
        return
      }
      case 'light': {
        const r = addObject(doc, { kind: 'light', ...snapPoint(p, s ? 0.5 : 0) }, ui.activeLayer)
        commit(r.doc)
        select([r.id])
        return
      }
      case 'token': {
        const r = addToken(doc, p, ui.activeLayer)
        commit(withExplored(r.doc))
        select([r.id])
        return
      }
      case 'ruler':
        gesture.current = { type: 'ruler' }
        setRuler({ mode: ui.ruler, start: p, end: p, cells: [cellOf(p)] })
        return
    }
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
    const p = toMap(e)
    setCursor(p)
    const g = gesture.current
    if (!g) return
    const s = step(e)
    switch (g.type) {
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
      case 'rotate':
      case 'resize':
      case 'vertex':
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
        const op = e.altKey ? (st.op === 'add' ? 'subtract' : 'add') : st.op
        const r = addObject(
          doc,
          ui.tool === 'room' ? { kind: 'room', ...center, shape, op } : { kind: 'area', ...center, shape, op, fill: st.fill },
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
                    ? { kind: 'room', x: o.x, y: o.y, shape: { type: 'path', points, closed: true }, op: e.altKey ? 'subtract' : st.op }
                    : { kind: 'area', x: o.x, y: o.y, shape: { type: 'path', points, closed: true }, op: e.altKey ? 'subtract' : st.op, fill: st.fill },
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

  const cursorStyle = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'

  return (
    <div
      ref={host}
      tabIndex={-1}
      data-map-viewport
      className="absolute inset-0 overflow-hidden bg-app outline-none select-none"
      style={{ cursor: cursorStyle, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setCursor(null)}
      onDoubleClick={() => pen && finishPen(false)}
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
            <Overlays
              doc={shown}
              px={px}
              selected={ui.selected}
              selectedObject={ui.viewMode === 'gm' ? selectedObject : undefined}
              pen={pen}
              cursor={cursor}
              drawing={drawing && { ...drawing, ellipse: ui.shape === 'ellipse', subtract: ui.op === 'subtract' }}
              stroke={stroke && { points: stroke, brush: ui.tool === 'brush', width: ui.stroke.width }}
              marquee={marquee}
              ruler={ruler}
              doorGhost={tool === 'door' && cursor ? doorSpot(cursor, ui.snap) : null}
            />
          </g>
        </svg>
      )}
    </div>
  )
}

function replace(doc: MapDoc, o: MapObject): MapDoc {
  return { ...doc, objects: doc.objects.map((x) => (x.id === o.id ? o : x)) }
}

/** The object with a new local size, centered on `center`. */
function resized(o: MapObject, w: number, h: number, center: Point): MapObject {
  const at = { x: center.x, y: center.y }
  if (o.kind === 'image') return { ...o, ...at, w, h }
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
  pen: Pen | null
  cursor: Point | null
  drawing: { a: Point; b: Point; ellipse: boolean; subtract: boolean } | null
  stroke: { points: Point[]; brush: boolean; width: number } | null
  marquee: { a: Point; b: Point } | null
  ruler: Ruler | null
  doorGhost: { x: number; y: number; rotation: number } | null
}

function Overlays({ doc, px, selected, selectedObject, pen, cursor, drawing, stroke, marquee, ruler, doorGhost }: OverlayProps) {
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
    const resizable = o.kind === 'image' || (isShaped(o) && o.shape.type !== 'path') || (isShaped(o) && o.shape.type === 'path' && o.kind !== 'wall')
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
        {o.kind === 'light' && (
          <>
            <circle r={o.dim} fill="none" stroke="#ffd27a" strokeDasharray="6 4" {...thin} pointerEvents="none" />
            <circle r={o.bright} fill="none" stroke="#ffd27a" {...thin} pointerEvents="none" />
          </>
        )}
      </g>
    )
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
