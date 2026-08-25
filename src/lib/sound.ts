let ctx: AudioContext | null = null

function getContext() {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export async function unlockAudio() {
  const audio = getContext()
  if (audio.state === 'suspended') await audio.resume()
}

export async function playBuzzer() {
  const audio = getContext()
  if (audio.state === 'suspended') await audio.resume()

  const now = audio.currentTime
  const master = audio.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.85, now + 0.02)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.15)
  master.connect(audio.destination)

  ;[185, 220].forEach((frequency, index) => {
    const oscillator = audio.createOscillator()
    oscillator.type = index === 0 ? 'sawtooth' : 'square'
    oscillator.frequency.value = frequency
    oscillator.connect(master)
    oscillator.start(now)
    oscillator.stop(now + 1.15)
  })
}
