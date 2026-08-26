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
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = i === 2 ? 520 : 430
    gain.gain.setValueAtTime(0.0001, start + i * 0.3)
    gain.gain.exponentialRampToValueAtTime(0.75, start + i * 0.3 + 0.02)
    gain.gain.setValueAtTime(0.75, start + i * 0.3 + 0.18)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.3 + 0.26)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start + i * 0.3)
    osc.stop(start + i * 0.3 + 0.28)
  }
  if (navigator.vibrate) navigator.vibrate([250, 100, 250, 100, 400])
}
