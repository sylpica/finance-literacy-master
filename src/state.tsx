import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Note, ReviewScheduleItem, StudyAttempt, VirtualRecord } from './types';
import { loadState, addAttempt, saveScheduleItem, toggleBookmark, saveNote, addVirtual, replaceState, wipeState, type AppState } from './store/db';
import { applyReview, initSchedule } from './learning/srs';

interface Ctx {
  state: AppState | null;
  recordAttempt: (a: StudyAttempt) => Promise<void>;
  toggleBookmark: (lessonId: string) => Promise<void>;
  saveNote: (n: Note) => Promise<void>;
  addVirtual: (r: VirtualRecord) => Promise<void>;
  importState: (s: AppState) => Promise<void>;
  wipe: () => Promise<void>;
  density: 'normal' | 'dense';
  setDensity: (d: 'normal' | 'dense') => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
}
const AppCtx = createContext<Ctx | null>(null);

function readSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try { const v = localStorage.getItem(key); return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback; }
  catch { return fallback; }
}
function writeSetting(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* 保存できない環境では設定は保持されない */ } }

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [density, setDensityState] = useState<'normal' | 'dense'>(() => readSetting('flm-density', ['normal', 'dense'], 'normal'));
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => readSetting('flm-theme', ['dark', 'light'], 'dark'));
  useEffect(() => { void loadState().then(setState); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; writeSetting('flm-theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.dataset.density = density; writeSetting('flm-density', density); }, [density]);

  const recordAttempt = useCallback(async (a: StudyAttempt) => {
    if (!state) return;
    let next = await addAttempt(state, a);
    const existing = next.schedule.find(s => s.questionId === a.questionId) ?? initSchedule(a.questionId, a.answeredAt);
    const updated: ReviewScheduleItem = applyReview(existing, a.correct, a.answeredAt);
    next = await saveScheduleItem(next, updated);
    setState(next);
  }, [state]);
  const toggleBookmarkFn = useCallback(async (lessonId: string) => { if (state) setState(await toggleBookmark(state, lessonId)); }, [state]);
  const saveNoteFn = useCallback(async (n: Note) => { if (state) setState(await saveNote(state, n)); }, [state]);
  const addVirtualFn = useCallback(async (r: VirtualRecord) => { if (state) setState(await addVirtual(state, r)); }, [state]);
  const importState = useCallback(async (s: AppState) => { await replaceState(s); setState(s); }, []);
  const wipe = useCallback(async () => { setState(await wipeState()); }, []);

  return (
    <AppCtx.Provider value={{
      state, recordAttempt, toggleBookmark: toggleBookmarkFn, saveNote: saveNoteFn, addVirtual: addVirtualFn,
      importState, wipe, density, setDensity: setDensityState, theme, setTheme: setThemeState,
    }}>{children}</AppCtx.Provider>
  );
}
export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
