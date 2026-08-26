export async function registerPwa() {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/service-worker.js')
  } catch (error) {
    console.warn('Service worker registration failed', error)
  }
}
