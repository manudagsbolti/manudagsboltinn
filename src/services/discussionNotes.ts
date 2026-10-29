import { db } from '../db/localDb'
import { supabase } from '../lib/supabase'
import { withSyncLock } from './syncLock'
import type { Presentation } from './presentations'

export interface DiscussionEntry {
  id:string; presentationId:string; presentationTitle:string; seasonId:string; eventDate:string
  topic:string; outcome:string; createdAt:string
}
export type LocalDiscussionEntry=DiscussionEntry & {syncState:'pending'|'synced'}

export async function saveDiscussionEntry(p:Presentation,topic:string,outcome:string) {
  if(!topic.trim()||!outcome.trim())throw new Error('Skráðu umræðuefni og niðurstöðu.')
  const entry:LocalDiscussionEntry={id:crypto.randomUUID(),presentationId:p.id,presentationTitle:p.title,seasonId:p.seasonId,eventDate:p.eventDate,topic:topic.trim(),outcome:outcome.trim(),createdAt:new Date().toISOString(),syncState:'pending'}
  await db.discussionNotes.add(entry)
  return entry
}

export async function syncDiscussionNotes() {
  if(!supabase)return
  const client=supabase
  return withSyncLock(async()=>{
    const pending=await db.discussionNotes.where('syncState').equals('pending').toArray()
    for(const row of pending){
      const {syncState:_,...document}=row
      const {error}=await client.rpc('save_discussion_entry',{document})
      if(error)throw new Error('Niðurstöður eru vistaðar á tækinu en samstilling mistókst. Athugaðu net, stjórnandaaðgang og migration 019.')
      await db.discussionNotes.update(row.id,{syncState:'synced'})
    }
    const {data,error}=await client.rpc('list_discussion_entries')
    if(error||!Array.isArray(data))throw new Error('Ekki tókst að sækja niðurstöðusafnið. Local niðurstöður haldast.')
    await db.discussionNotes.bulkPut((data as DiscussionEntry[]).map(row=>({...row,syncState:'synced' as const})))
  })
}
