let context: AudioContext | null = null

function getContext() {
  if (!context) context = new AudioContext()
  return context
}

export async function unlockAudio() {
  const ctx = getContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  gain.gain.value = 0.00001
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + 0.02)
}

export async function playBuzzer() {
  const ctx = getContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const start = ctx.currentTime
  // Two short whistle blasts followed by a longer final blast. Sine tones
  // avoid the harsh square-wave buzzer; close frequencies add whistle flutter.
  for (const [offset, duration] of [[0, 0.18], [0.30, 0.18], [0.62, 0.65]]) {
    for (const frequency of [2800, 2920]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency - 120, start + offset)
    osc.frequency.linearRampToValueAtTime(frequency, start + offset + 0.035)
    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.015)
    gain.gain.setValueAtTime(0.22, start + offset + duration - 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration)
    osc.connect(gain).connect(ctx.destination)
    osc.onended = () => { osc.disconnect(); gain.disconnect() }
    osc.start(start + offset)
    osc.stop(start + offset + duration + 0.01)
    }
  }
  if (navigator.vibrate) navigator.vibrate([250, 100, 250, 100, 400])
}
