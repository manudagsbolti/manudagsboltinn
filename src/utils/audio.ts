export function playBuzzer() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.45, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 1.15)
    const osc = context.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(150, context.currentTime)
    osc.frequency.linearRampToValueAtTime(95, context.currentTime + 1.1)
    osc.connect(gain)
    gain.connect(context.destination)
    osc.start()
    osc.stop(context.currentTime + 1.2)
    if (navigator.vibrate) navigator.vibrate([250, 80, 250])
  } catch { /* browser may block audio until user gesture */ }
}
