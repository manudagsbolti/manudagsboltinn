import { expect, it } from 'vitest'
import { deckArt, renderSlide, slideDesign } from './presentationDesign'
import { standalonePresentationHtml } from './presentationExport'
import type { Presentation } from './presentations'

it('gives award, pair and title slides distinct art and layouts while escaping player data', () => {
  const slide = { title: 'Kafnarinn', columns: ['Leikmaður','Choke'], rows: [['<img src=x onerror=alert(1)>','9']] }
  const html = renderSlide(slide, 3)
  expect(slideDesign(slide, 3).art).toBe(deckArt.choke)
  expect(html).toContain('deck-ranking')
  expect(html).toContain('&lt;img')
  expect(html).not.toContain('<img src=x')
  expect(slideDesign({...slide,title:'Besta pörunin'},2).art).toBe(deckArt.duo)
  expect(slideDesign(slide,0).layout).toBe('cover')
  expect(slideDesign({...slide,title:'1. sæti'},5).layout).toBe('podium')
})

it('exports the same design with embedded art and links to the original app', () => {
  const p:Presentation = {id:'test',schemaVersion:1,title:'Miðannamat',kind:'midterm',seasonId:'s',eventDate:'2026-10-29',cutoff:'2026-10-28',publishedAt:'',slides:[{title:'Miðannamat',columns:[],rows:[]}]}
  const html = standalonePresentationHtml(p,new Map([[deckArt.hero,'data:image/png;base64,AAAA']]),'https://example.com/')
  expect(html).toContain('data:image/png;base64,AAAA')
  expect(html).not.toContain(deckArt.hero)
  expect(html).toContain('href="https://example.com/#/home"')
  expect(html).toContain('href="https://example.com/#/stats"')
  expect(html).toContain('deck-cover')
  expect(html).not.toContain('access_token')
})

it('keeps names out of suspense slides and makes the gold reveal a distinct finale',()=>{
  const intro=renderSlide({title:'1. sæti',columns:[],rows:[],story:{kind:'podium',phase:'intro',rank:1,caption:'Hver á toppinn?'}},5)
  expect(intro).toContain('deck-mystery')
  expect(intro).not.toContain('deck-story-names')
  const reveal=renderSlide({title:'1. sæti',columns:['Leikmaður'],rows:[['Winner A'],['Winner B']],story:{kind:'podium',phase:'reveal',rank:1,caption:'Toppnum er deilt.',value:'50%',finale:true}},7)
  expect(reveal).toContain('deck-is-finale')
  expect(reveal).toContain('deck-story-gold')
  expect(reveal).toContain('Winner A')
  expect(reveal).toContain('Winner B')
})
