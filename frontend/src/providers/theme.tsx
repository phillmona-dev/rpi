'use client';
import * as React from 'react';

type Theme = 'light' | 'dark' | 'system';
/** Light unless the person has chosen dark (or to follow the system) in the theme menu. */
const DEFAULT: Theme = 'light';
const Ctx = React.createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: DEFAULT, setTheme: () => undefined });
const KEY = 'rpis.theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(DEFAULT);
  React.useEffect(() => { try { const s = localStorage.getItem(KEY) as Theme | null; if (s) setThemeState(s); } catch { /* ignore */ } }, []);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { const dark = theme === 'dark' || (theme === 'system' && mq.matches); document.documentElement.classList.toggle('dark', dark); document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; };
    apply(); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply);
  }, [theme]);
  const setTheme = (t: Theme) => { setThemeState(t); try { localStorage.setItem(KEY, t); } catch { /* ignore */ } };
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}
export const useTheme = () => React.useContext(Ctx);

/** Inline script so the first paint already has the right theme class (no flash). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${KEY}');var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}}catch(e){}})();`;
