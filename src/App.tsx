import ClipboardTranslation from './components/ClipboardTranslation'
import ScreenshotSelection from './components/ScreenshotSelection'
import TranslationOverlay from './components/TranslationOverlay'
import { UpdateProvider } from './contexts/UpdateContext'
import { useExternalLinkHandler } from './lib/external-link'
import Home from './pages/Home'

function windowMode() {
  return new URLSearchParams(window.location.search).get('window')
}

function App() {
  useExternalLinkHandler()
  const mode = windowMode()

  if (mode === 'clipboard-translation') {
    return <ClipboardTranslation />
  }

  if (mode === 'screenshot-selection') {
    return <ScreenshotSelection />
  }

  if (mode === 'translation-overlay') {
    return <TranslationOverlay />
  }

  return (
    <UpdateProvider checkOnMount={true}>
      <Home />
    </UpdateProvider>
  )
}

export default App
