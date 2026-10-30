import { lazy, Suspense } from 'react'
import { UpdateProvider } from './contexts/UpdateContext'
import { useExternalLinkHandler } from './lib/external-link'

const Home = lazy(() => import('./pages/Home'))
const ClipboardTranslation = lazy(() => import('./components/ClipboardTranslation'))
const ScreenshotSelection = lazy(() => import('./components/ScreenshotSelection'))
const TranslationOverlay = lazy(() => import('./components/TranslationOverlay'))

function windowMode() {
  return new URLSearchParams(window.location.search).get('window')
}

function App() {
  useExternalLinkHandler()
  const mode = windowMode()

  if (mode === 'clipboard-translation') {
    return <Suspense fallback={null}><ClipboardTranslation /></Suspense>
  }

  if (mode === 'screenshot-selection') {
    return <Suspense fallback={null}><ScreenshotSelection /></Suspense>
  }

  if (mode === 'translation-overlay') {
    return <Suspense fallback={null}><TranslationOverlay /></Suspense>
  }

  return (
    <UpdateProvider checkOnMount={true}>
      <Suspense fallback={null}>
        <Home />
      </Suspense>
    </UpdateProvider>
  )
}

export default App
