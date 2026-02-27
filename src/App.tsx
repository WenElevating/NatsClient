import MainLayout from './components/MainLayout'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

function App() {
  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  )
}

export default App
