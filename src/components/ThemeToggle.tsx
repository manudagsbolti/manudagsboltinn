export type ColorTheme = 'dark' | 'light'

export function ThemeToggle({ theme, onChange }: { theme: ColorTheme; onChange: (theme: ColorTheme) => void }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return <button
    className="theme-toggle"
    type="button"
    aria-label={`Skipta yfir í ${next === 'dark' ? 'dökkt' : 'ljóst'} útlit`}
    title={`Skipta yfir í ${next === 'dark' ? 'dökkt' : 'ljóst'} útlit`}
    onClick={() => onChange(next)}
  >
    <span aria-hidden="true" className="theme-toggle-icon">{theme === 'dark' ? '☾' : '☀'}</span>
    <span>{theme === 'dark' ? 'Dökkt' : 'Ljóst'}</span>
    <i aria-hidden="true"><b /></i>
  </button>
}
