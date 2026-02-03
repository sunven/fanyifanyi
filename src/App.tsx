import { UpdateProvider } from './contexts/UpdateContext'
import Home from './pages/Home'

function App() {
  return (
    <UpdateProvider checkOnMount={true}>
      <Home />
    </UpdateProvider>
  )
}

export default App
