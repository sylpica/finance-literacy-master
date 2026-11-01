// ローカル保存（指示書 §11）: 学習データは端末内 IndexedDB に保存する。
// ブラウザ保存領域は永久保持が保証されないため、設定画面でバックアップを案内する。
import type { BackupData, Bookmark, Note, ReviewScheduleItem, StudyAttempt, VirtualRecord } from '../types';

const DB_NAME = 'finance-literacy-master';
const DB_VERSION = 1;
const STORES = ['attempts', 'schedule', 'bookmarks', 'notes', 'virtual'] as const;

export interface AppState {
  attempts: StudyAttempt[];
  schedule: ReviewScheduleItem[];
  bookmarks: Bookmark[];
  notes: Note[];
  virtual: VirtualRecord[];
}

const emptyState = (): AppState => ({ attempts: [], schedule: [], bookmarks: [], notes: [], virtual: [] });
let memoryFallback: AppState | null = null;
let useMemory = false;

function openDb(): Promise<IDBDatabase | null> {
  if (useMemory || typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { autoIncrement: true });
      if (!db.objectStoreNames.contains('schedule')) db.createObjectStore('schedule', { keyPath: 'questionId' });
      if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'lessonId' });
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('virtual')) db.createObjectStore('virtual', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { useMemory = true; resolve(null); };
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    if (!db) { reject(new Error('IndexedDB unavailable')); return; }
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
const getAll = <T,>(store: string) => tx<T[]>(store, 'readonly', s => s.getAll() as IDBRequest<T[]>);
const put = (store: string, value: unknown, key?: IDBValidKey) => tx('schedule' in {} ? store : store, 'readwrite', s => (key !== undefined ? s.put(value, key) : s.put(value)));
const del = (store: string, key: IDBValidKey) => tx(store, 'readwrite', s => s.delete(key));
const clearStore = (store: string) => tx(store, 'readwrite', s => s.clear());

export async function loadState(): Promise<AppState> {
  if (useMemory || typeof indexedDB === 'undefined') { memoryFallback ??= emptyState(); return structuredClone(memoryFallback); }
  try {
    const [attempts, schedule, bookmarks, notes, virtual] = await Promise.all([
      getAll<StudyAttempt>('attempts'), getAll<ReviewScheduleItem>('schedule'),
      getAll<Bookmark>('bookmarks'), getAll<Note>('notes'), getAll<VirtualRecord>('virtual'),
    ]);
    return { attempts, schedule, bookmarks, notes, virtual };
  } catch { useMemory = true; memoryFallback ??= emptyState(); return structuredClone(memoryFallback); }
}

async function persistAll(state: AppState): Promise<void> {
  if (useMemory || typeof indexedDB === 'undefined') { memoryFallback = structuredClone(state); return; }
  for (const s of STORES) await clearStore(s);
  for (const a of state.attempts) await put('attempts', a);
  for (const s of state.schedule) await put('schedule', s);
  for (const b of state.bookmarks) await put('bookmarks', b);
  for (const n of state.notes) await put('notes', n);
  for (const v of state.virtual) await put('virtual', v);
}

export async function addAttempt(state: AppState, a: StudyAttempt): Promise<AppState> {
  const next = { ...state, attempts: [...state.attempts, a] };
  if (!(useMemory || typeof indexedDB === 'undefined')) { try { await put('attempts', a); return next; } catch { /* fallthrough */ } }
  memoryFallback = next; return next;
}
export async function saveScheduleItem(state: AppState, item: ReviewScheduleItem): Promise<AppState> {
  const next = { ...state, schedule: [...state.schedule.filter(s => s.questionId !== item.questionId), item] };
  if (!(useMemory || typeof indexedDB === 'undefined')) { try { await put('schedule', item); return next; } catch { /* fallthrough */ } }
  memoryFallback = next; return next;
}
export async function toggleBookmark(state: AppState, lessonId: string): Promise<AppState> {
  const exists = state.bookmarks.some(b => b.lessonId === lessonId);
  const next = { ...state, bookmarks: exists ? state.bookmarks.filter(b => b.lessonId !== lessonId) : [...state.bookmarks, { lessonId, createdAt: Date.now() }] };
  if (!(useMemory || typeof indexedDB === 'undefined')) {
    try { if (exists) await del('bookmarks', lessonId); else await put('bookmarks', { lessonId, createdAt: Date.now() }); return next; } catch { /* fallthrough */ }
  }
  memoryFallback = next; return next;
}
export async function saveNote(state: AppState, note: Note): Promise<AppState> {
  const next = { ...state, notes: [...state.notes.filter(n => n.id !== note.id), note] };
  if (!(useMemory || typeof indexedDB === 'undefined')) { try { await put('notes', note); return next; } catch { /* fallthrough */ } }
  memoryFallback = next; return next;
}
export async function addVirtual(state: AppState, rec: VirtualRecord): Promise<AppState> {
  const next = { ...state, virtual: [...state.virtual, rec] };
  if (!(useMemory || typeof indexedDB === 'undefined')) { try { await put('virtual', rec); return next; } catch { /* fallthrough */ } }
  memoryFallback = next; return next;
}

export function exportBackup(state: AppState): BackupData {
  return { format: 'finance-literacy-master-backup', version: 1, exportedAt: new Date().toISOString(), ...state };
}

/** インポート検証: 形式・バージョンを確認し、不正データは例外で拒否する（指示書 §15.4） */
export function parseBackup(json: string): AppState {
  const data = JSON.parse(json) as Partial<BackupData>;
  if (data.format !== 'finance-literacy-master-backup') throw new Error('バックアップ形式が違います');
  if (data.version !== 1) throw new Error(`未対応のバックアップバージョンです: ${String(data.version)}`);
  const arr = <T,>(v: unknown): T[] => { if (!Array.isArray(v)) throw new Error('バックアップの配列が不正です'); return v as T[]; };
  return {
    attempts: arr<StudyAttempt>(data.attempts), schedule: arr<ReviewScheduleItem>(data.schedule),
    bookmarks: arr<Bookmark>(data.bookmarks), notes: arr<Note>(data.notes), virtual: arr<VirtualRecord>(data.virtual),
  };
}
export async function replaceState(state: AppState): Promise<void> { await persistAll(state); }
export async function wipeState(): Promise<AppState> { const e = emptyState(); await persistAll(e); return e; }
