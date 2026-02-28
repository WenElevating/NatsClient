import { useEffect } from 'react'
import MainLayout from './components/MainLayout'
import ErrorBoundary from './components/ErrorBoundary'
import { useSettingsStore } from './stores'
import './App.css'

function App() {
  const { theme } = useSettingsStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  )
}

export default App
