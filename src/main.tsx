import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { LandingPage } from './LandingPage'

const APP_ROUTES = [
  '/app', '/lobby',
  '/login', '/register', '/forgot-password', '/reset-password',
  '/admin', '/leaderboard', '/profile',
]

const isAppRoute = APP_ROUTES.some((r) => window.location.pathname.startsWith(r))

if (isAppRoute) {
  document.documentElement.classList.add('game-root')
  document.body.classList.add('game-root')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isAppRoute ? <App /> : <LandingPage />}</StrictMode>,
)
