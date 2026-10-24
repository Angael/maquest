/// <reference types="vite/client" />
import type { Bridge } from '../../preload'

declare global {
  interface Window {
    maquest: Bridge
  }
}
