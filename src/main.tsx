import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './context/AppContext'
import { registerPwa } from './lib/pwa'

registerPwa()

createRoot(document.getElementById('root')!).render(<StrictMode><AppProvider><App /></AppProvider></StrictMode>)
