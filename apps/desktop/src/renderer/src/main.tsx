import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queries'
import { App } from './App'
import { PlayerView } from './components/map/PlayerView'
import '@fontsource-variable/inter/opsz.css'
import '@fontsource-variable/inter/opsz-italic.css'
import '@fontsource-variable/literata/opsz.css'
import '@fontsource-variable/literata/opsz-italic.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles.css'

/** A player window (see main/windows.ts) shows one map as the players see it, nothing else. */
const player = new URLSearchParams(location.search).get('player')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>{player ? <PlayerView id={player} /> : <App />}</QueryClientProvider>
  </StrictMode>,
)
