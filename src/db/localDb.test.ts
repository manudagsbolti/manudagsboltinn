import Dexie from 'dexie'
import { expect, it } from 'vitest'
import { db, ManudagsboltinnDb } from './localDb'
import type { Game, SetRecord } from '../domain/types'

it('upgrades an unfinished opening game without rewriting completed history', async () => {
  const name = 'v1-upgrade-test'
  await Dexie.delete(name)
  const previous = new Dexie(name)
  previous.version(4).stores(Object.fromEntries(db.tables.map(t => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map(i=>i.src)].join(',') ])))
  await previous.open()
  const set: SetRecord = {id:'set',sessionId:'session',setNo:1,status:'live',createdAt:'',updatedAt:''}
  const game: Game = {id:'active',setId:'set',gameNo:1,holderTeamId:'A',challengerTeamId:'B',waitingTeamId:'C',incumbentTeamId:'A',status:'live',remainingSeconds:100,durationSeconds:180,createdAt:'',updatedAt:''}
  await previous.table('sets').add(set)
  await previous.table('games').bulkAdd([game,{...game,id:'history',status:'completed'}])
  previous.close()
  const upgraded = new ManudagsboltinnDb(name)
  try {
    await upgraded.open()
    expect((await upgraded.games.get('active'))?.incumbentTeamId).toBeNull()
    expect((await upgraded.games.get('history'))?.incumbentTeamId).toBe('A')
    expect((await upgraded.games.get('active'))?.remainingSeconds).toBe(100)
  } finally { upgraded.close(); await Dexie.delete(name) }
})
