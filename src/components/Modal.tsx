import type { ReactNode } from 'react'

export function Modal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className="modal-backdrop"><div className={`modal ${className}`}>{children}</div></div>
}
