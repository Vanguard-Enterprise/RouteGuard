export const DEMO_SESSION_COOKIE = 'rg_demo_user'

export function saveDemoSession(email: string, name: string) {
  const user = { id: 'demo-user', email, name }
  const encoded = encodeURIComponent(JSON.stringify(user))
  document.cookie = `${DEMO_SESSION_COOKIE}=${encoded}; Path=/; Max-Age=2592000; SameSite=Lax`
  window.localStorage.setItem(DEMO_SESSION_COOKIE, JSON.stringify(user))
}

export function clearDemoSession() {
  document.cookie = `${DEMO_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
  window.localStorage.removeItem(DEMO_SESSION_COOKIE)
}

