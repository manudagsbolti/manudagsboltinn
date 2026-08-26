import type { PlayerRole } from '../domain/types'

export function RoleBadge({ role }: { role: PlayerRole }) {
  return <span className={`role-badge ${role === 'REGULAR' ? 'regular' : 'substitute'}`}>
    {role === 'REGULAR' ? 'F' : 'V'}
  </span>
}
