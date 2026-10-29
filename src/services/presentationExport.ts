import type { Presentation } from './presentations'
import { deckStyles, escapeHtml, renderSlide, slideDesign } from './presentationDesign'

export function standalonePresentationHtml(p: Presentation, artwork: Map<string, string>, appUrl: string) {
  const e = escapeHtml
  return `<!doctype html><html lang="is"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(p.title)}</title><style>
body{margin:0;background:#101416}.event-presentation{display:flex;flex-direction:column;min-height:100dvh}.deck-page{width:100%}.deck-page[hidden]{display:none}${deckStyles}
</style><body><div class="event-presentation"><header class="deck-toolbar"><a href="${e(appUrl)}#/home">↗ Inn í kerfið</a><a href="${e(appUrl)}#/stats">Tölfræði</a><span>${e(p.title)} · ${e(p.eventDate)}</span><button onclick="document.documentElement.requestFullscreen?.()">⛶ Allur skjár</button></header><main class="deck-stage">${p.slides.map((slide, i) => `<section class="deck-page" ${i ? 'hidden' : ''}>${renderSlide(slide, i, artwork.get(slideDesign(slide, i).art))}</section>`).join('')}</main><footer class="deck-controls"><button id="prev">← Fyrri</button><label><select id="jump" aria-label="Velja glæru">${p.slides.map((slide, i) => `<option value="${i}">${i + 1}. ${e(slide.title)}</option>`).join('')}</select></label><span id="count" class="deck-counter"></span><button id="next">Næsta →</button></footer></div><script>
let i=0;const pages=[...document.querySelectorAll('.deck-page')];function show(n){i=Math.max(0,Math.min(pages.length-1,n));pages.forEach((p,j)=>p.hidden=j!==i);document.getElementById('count').textContent=(i+1)+' / '+pages.length;document.getElementById('jump').value=String(i);document.getElementById('prev').disabled=i===0;document.getElementById('next').disabled=i===pages.length-1}document.getElementById('prev').onclick=()=>show(i-1);document.getElementById('next').onclick=()=>show(i+1);document.getElementById('jump').onchange=e=>show(Number(e.target.value));onkeydown=e=>{if((e.target.closest('select,input')||(e.key===' '&&e.target.closest('button,a,summary'))))return;if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();show(i+1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(i-1)}};show(0)
</script></body></html>`
}

async function embeddedArt(path: string): Promise<string> {
  const response = await fetch(path)
  if (!response.ok) throw new Error('Mynd náðist ekki fyrir HTML niðurhal.')
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('Ógild mynd fyrir HTML niðurhal.')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Ekki tókst að lesa mynd.'))
    reader.readAsDataURL(blob)
  })
}

export async function downloadPresentation(p: Presentation) {
  const paths = [...new Set(p.slides.map((slide, i) => slideDesign(slide, i).art).filter(Boolean))]
  const artwork = new Map(await Promise.all(paths.map(async path => [path, await embeddedArt(path)] as const)))
  // Link back to the same application without copying any auth parameters.
  const appUrl = new URL(window.location.pathname, window.location.origin)
  const html = standalonePresentationHtml(p, artwork, appUrl.href)
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = `manudagsboltinn-${p.eventDate}-${p.id}.html`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
