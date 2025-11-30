import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { LandingPage } from './LandingPage'

const isGameRoute = window.location.pathname.startsWith('/app')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isGameRoute ? <App /> : <LandingPage />}
  </StrictMode>,
)
