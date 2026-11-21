import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queries'
import './lib/analytics'
import { App } from './App'
import { ErrorBoundary } from './components/CrashScreen'
import { installGlobalErrorHandlers } from './lib/errors'
import '@fontsource-variable/inter/opsz.css'
import '@fontsource-variable/inter/opsz-italic.css'
import '@fontsource-variable/literata/opsz.css'
import '@fontsource-variable/literata/opsz-italic.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles.css'

installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary where="Showing the app">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// The main process checks for this: without it the window stayed blank and it shows a crash dialog instead.
document.documentElement.dataset.booted = '1'
