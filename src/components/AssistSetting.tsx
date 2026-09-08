import { useState } from 'react'
import { setAssistRecording } from '../data/repository'
export function AssistSetting({sessionId, enabled}: {sessionId: string; enabled: boolean}) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  return <div className="assist-setting"><button role="switch" aria-checked={enabled} disabled={busy} onClick={()=>{
    setBusy(true);setError('')
    void setAssistRecording(sessionId,!enabled).catch(e=>setError(e instanceof Error?e.message:'Vistun mistókst.')).finally(()=>setBusy(false))
  }}>Stoðsendingaskráning: {enabled?'Kveikt':'Slökkt'}</button><small>Gildir fyrir næstu mörk. Eldri skráning helst.</small>{error && <p role="alert">{error}</p>}</div>
}
