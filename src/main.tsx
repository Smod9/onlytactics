import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { LandingPage } from './LandingPage'

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/admin']

const isAppRoute =
  window.location.pathname.startsWith('/app') ||
  window.location.pathname.startsWith('/lobby') ||
  AUTH_ROUTES.some((r) => window.location.pathname.startsWith(r))

if (isAppRoute) {
  document.documentElement.classList.add('game-root')
  document.body.classList.add('game-root')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isAppRoute ? <App /> : <LandingPage />}</StrictMode>,
)
