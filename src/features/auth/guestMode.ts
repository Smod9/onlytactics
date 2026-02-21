const GUEST_MODE_KEY = 'sgame:guestMode'

export function setGuestMode() {
  localStorage.setItem(GUEST_MODE_KEY, 'true')
}

export function clearGuestMode() {
  localStorage.removeItem(GUEST_MODE_KEY)
}

export function isGuestMode(): boolean {
  return localStorage.getItem(GUEST_MODE_KEY) === 'true'
}
