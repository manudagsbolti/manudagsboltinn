import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../db/localDb'
import { saveDiscussionEntry, syncDiscussionNotes } from './discussionNotes'
import { signOutSafely } from './access'
import type { Presentation } from './presentations'
import migration from '../../supabase/migrations/019_discussion_entries.sql?raw'

const cloud=vi.hoisted(()=>({rpc:vi.fn(),signOut:vi.fn()}))
vi.mock('../lib/supabase',()=>({supabase:{rpc:cloud.rpc,auth:{signOut:cloud.signOut}}}))
const p:Presentation={id:'00000000-0000-0000-0000-000000000010',title:'Miðannamat',seasonId:'s',kind:'midterm',schemaVersion:1,eventDate:'2026-10-29',cutoff:'2026-10-28',publishedAt:'',slides:[]}
beforeEach(async()=>{await db.transaction('rw',db.tables,async()=>{for(const t of db.tables)await t.clear()});cloud.rpc.mockReset();cloud.signOut.mockReset()})
it('persists outcomes independently of the frozen deck, retains failed sends and blocks sign-out',async()=>{
  const before=JSON.stringify(p)
  const entry=await saveDiscussionEntry(p,' Mæting ',' Sammála um betri fyrirvara. ')
  expect(await db.discussionNotes.get(entry.id)).toMatchObject({topic:'Mæting',outcome:'Sammála um betri fyrirvara.',syncState:'pending'})
  expect(JSON.stringify(p)).toBe(before)
  cloud.rpc.mockResolvedValue({error:{message:'offline'}})
  await expect(syncDiscussionNotes()).rejects.toThrow()
  expect((await db.discussionNotes.get(entry.id))?.syncState).toBe('pending')
  await expect(signOutSafely()).rejects.toThrow('ósendar')
  expect(cloud.signOut).not.toHaveBeenCalled()
  const {syncState:_,...document}=entry
  cloud.rpc.mockImplementation(async(name:string)=>name==='save_discussion_entry'?{error:null}:{error:null,data:[document]})
  await syncDiscussionNotes()
  expect((await db.discussionNotes.get(entry.id))?.syncState).toBe('synced')
  await saveDiscussionEntry(p,'Mæting','Ný niðurstaða eftir frekari umræðu.')
  expect(await db.discussionNotes.count()).toBe(2)
})

let pg:PGlite
const admin='00000000-0000-0000-0000-000000000001'
beforeAll(async()=>{
  pg=new PGlite()
  await pg.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.app_admins(user_id uuid primary key);insert into public.app_admins values('${admin}');
    grant usage on schema public,auth to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated;
    alter default privileges in schema public grant execute on functions to anon,authenticated;`)
  await pg.exec(migration)
},30000)
afterAll(async()=>{await pg?.close()})
const call=async(role:string,user:string,sql:string,args:unknown[]=[])=>pg.transaction(async tx=>{
  await tx.exec(`set local role ${role}`)
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user])
  return tx.query(sql,args)
})
it('allows append-only admin notes, safe retries, and no public or recorder access',async()=>{
  const {syncState:_,...document}=await saveDiscussionEntry(p,'Dómgæsla','Samkomulag um framkvæmd.')
  const sql='select public.save_discussion_entry($1::jsonb)'
  await call('authenticated',admin,sql,[JSON.stringify(document)])
  await call('authenticated',admin,sql,[JSON.stringify(document)])
  await expect(call('authenticated',admin,sql,[JSON.stringify({...document,outcome:'Overwrite'})])).rejects.toThrow()
  const result=await call('authenticated',admin,'select public.list_discussion_entries() as notes')
  expect((result.rows[0] as {notes:unknown[]}).notes).toHaveLength(1)
  await expect(call('anon','','select public.list_discussion_entries()')).rejects.toThrow()
  await expect(call('authenticated','','select public.list_discussion_entries()')).rejects.toThrow()
  await expect(call('authenticated','','select * from public.presentation_discussion_entries')).rejects.toThrow()
})
