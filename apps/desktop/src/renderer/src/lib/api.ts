import type { Handlers } from '../../../main/handlers'

type Api = { [K in keyof Handlers]: (...args: Parameters<Handlers[K]>) => Promise<Awaited<ReturnType<Handlers[K]>>> }

/** Typed proxy over the main-process handlers. */
export const api = new Proxy({} as Api, {
  get: (_t, method: string) => (...args: unknown[]) => window.maquest.invoke(method, args),
})

export const mediaUrl = (rel: string) => `maquest-media://p/${rel.split('/').map(encodeURIComponent).join('/')}`

const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i
export const isVideo = (p: string) => VIDEO.test(p)
