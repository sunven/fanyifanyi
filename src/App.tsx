import ScreenshotSelection from './components/ScreenshotSelection'
import TranslationOverlay from './components/TranslationOverlay'
import { UpdateProvider } from './contexts/UpdateContext'
import Home from './pages/Home'

function windowMode() {
  return new URLSearchParams(window.location.search).get('window')
}

function App() {
  const mode = windowMode()

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
