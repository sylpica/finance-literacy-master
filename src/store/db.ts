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

/** 保存・読込の失敗を UI へ知らせるための通知（監査指摘: 失敗が無通知でメモリ保持に切り替わると、タブを閉じたときに学習データが失われることに利用者が気づけない）。
 *  メモリ保持への切替はデータを黙って捨てないための保全策だが、切替自体は必ず利用者へ伝える。 */
let storageFailureListener: (() => void) | null = null;
export function setStorageFailureListener(fn: (() => void) | null): void { storageFailureListener = fn; }
function switchToMemory(): void {
  if (!useMemory) { useMemory = true; storageFailureListener?.(); }
}

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
    req.onerror = () => { switchToMemory(); resolve(null); };
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
const put = (store: string, value: unknown, key?: IDBValidKey) => tx(store, 'readwrite', s => (key !== undefined ? s.put(value, key) : s.put(value)));
const del = (store: string, key: IDBValidKey) => tx(store, 'readwrite', s => s.delete(key));

export async function loadState(): Promise<AppState> {
  if (useMemory || typeof indexedDB === 'undefined') { memoryFallback ??= emptyState(); return structuredClone(memoryFallback); }
  try {
    const [attempts, schedule, bookmarks, notes, virtual] = await Promise.all([
      getAll<StudyAttempt>('attempts'), getAll<ReviewScheduleItem>('schedule'),
      getAll<Bookmark>('bookmarks'), getAll<Note>('notes'), getAll<VirtualRecord>('virtual'),
    ]);
    return { attempts, schedule, bookmarks, notes, virtual };
  } catch { switchToMemory(); memoryFallback ??= emptyState(); return structuredClone(memoryFallback); }
}

async function persistAll(state: AppState): Promise<void> {
  if (useMemory || typeof indexedDB === 'undefined') { memoryFallback = structuredClone(state); return; }
  const db = await openDb();
  if (!db) { switchToMemory(); memoryFallback = structuredClone(state); return; }
  // 全ストアを単一トランザクションで置き換える（途中失敗で部分的に欠損しないよう原子的処理にする）
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORES as unknown as string[], 'readwrite');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('保存が中断されました'));
    const putAll = (store: string, items: unknown[]) => {
      const s = t.objectStore(store);
      s.clear();
      for (const item of items) s.put(item);
    };
    putAll('attempts', state.attempts);
    putAll('schedule', state.schedule);
    putAll('bookmarks', state.bookmarks);
    putAll('notes', state.notes);
    putAll('virtual', state.virtual);
  });
}

export async function addAttempt(state: AppState, a: StudyAttempt): Promise<AppState> {
  const next = { ...state, attempts: [...state.attempts, a] };
  if (!(useMemory || typeof indexedDB === 'undefined')) { try { await put('attempts', a); return next; } catch { switchToMemory(); /* 書込失敗: 以後はメモリ側を正本として扱い、黙って消えないようにする（切替は UI へ通知する） */ } }
  memoryFallback = next; return next;
}
export async function saveScheduleItem(state: AppState, item: ReviewScheduleItem): Promise<AppState> {
  const next = { ...state, schedule: [...state.schedule.filter(s => s.questionId !== item.questionId), item] };
  if (!(useMemory || typeof indexedDB === 'undefined')) { try { await put('schedule', item); return next; } catch { switchToMemory(); /* 書込失敗: 以後はメモリ側を正本として扱い、黙って消えないようにする（切替は UI へ通知する） */ } }
  memoryFallback = next; return next;
}
export async function toggleBookmark(state: AppState, lessonId: string): Promise<AppState> {
  const exists = state.bookmarks.some(b => b.lessonId === lessonId);
  const next = { ...state, bookmarks: exists ? state.bookmarks.filter(b => b.lessonId !== lessonId) : [...state.bookmarks, { lessonId, createdAt: Date.now() }] };
  if (!(useMemory || typeof indexedDB === 'undefined')) {
    try { if (exists) await del('bookmarks', lessonId); else await put('bookmarks', { lessonId, createdAt: Date.now() }); return next; } catch { switchToMemory(); /* 書込失敗: 以後はメモリ側を正本として扱い、黙って消えないようにする（切替は UI へ通知する） */ }
  }
  memoryFallback = next; return next;
}
export async function saveNote(state: AppState, note: Note): Promise<AppState> {
  const next = { ...state, notes: [...state.notes.filter(n => n.id !== note.id), note] };
  if (!(useMemory || typeof indexedDB === 'undefined')) { try { await put('notes', note); return next; } catch { switchToMemory(); /* 書込失敗: 以後はメモリ側を正本として扱い、黙って消えないようにする（切替は UI へ通知する） */ } }
  memoryFallback = next; return next;
}
export async function addVirtual(state: AppState, rec: VirtualRecord): Promise<AppState> {
  const next = { ...state, virtual: [...state.virtual, rec] };
  if (!(useMemory || typeof indexedDB === 'undefined')) { try { await put('virtual', rec); return next; } catch { switchToMemory(); /* 書込失敗: 以後はメモリ側を正本として扱い、黙って消えないようにする（切替は UI へ通知する） */ } }
  memoryFallback = next; return next;
}

export function exportBackup(state: AppState): BackupData {
  return { format: 'finance-literacy-master-backup', version: 1, exportedAt: new Date().toISOString(), ...state };
}

/** バックアップ形式の現行バージョン。将来スキーマを変更する場合は、旧バージョンを
 *  BACKUP_MIGRATIONS に移行関数（旧→新の純粋変換）として登録し、parseBackup が順に適用する。
 *  IndexedDB 側の移行は onupgradeneeded（ストア存在チェックによる追加方式）で行う。 */
export const BACKUP_VERSION = 1;
const BACKUP_MIGRATIONS: Record<number, (d: Partial<BackupData>) => Partial<BackupData>> = {
  // 例: 1: (d) => ({ ...d, version: 2, /* フィールド変換 */ })
};

/** 復元データの件数上限（監査指摘: 上限がないと巨大ファイルで検証・保存処理が暴走する）。
 *  通常利用では到達しない水準に置き、超過は「壊れた/想定外のファイル」として拒否する。 */
const BACKUP_LIMITS = { attempts: 1_000_000, schedule: 20_000, bookmarks: 20_000, notes: 200_000, virtual: 200_000 } as const;

/** インポート検証: 形式・バージョン・要素の構造を確認し、不正データは例外で拒否する（指示書 §15.4）。
 *  要素単位の検証がないと、壊れた要素が保存されて以後ずっとアプリが落ち続けるため、
 *  必須フィールドの型・数値範囲・一意性まで確認し、1件でも不正なら全体を拒否する。
 *  なおプロトタイプ汚染については、フィールドを明示的に読み取る実装であり __proto__ の
 *  マージ・代入経路は存在しない（監査で確認済み）。 */
export function parseBackup(json: string): AppState {
  let data = JSON.parse(json) as Partial<BackupData>;
  if (data.format !== 'finance-literacy-master-backup') throw new Error('バックアップ形式が違います');
  let version = data.version;
  // 移行関数が version を前進させない実装でも無限ループにならないよう反復上限を設ける（第2回再監査の指摘）
  for (let guard = 0; guard < 16 && typeof version === 'number' && version < BACKUP_VERSION && BACKUP_MIGRATIONS[version]; guard++) {
    data = BACKUP_MIGRATIONS[version]!(data); version = data.version;
  }
  if (version !== BACKUP_VERSION) throw new Error(`未対応のバックアップバージョンです: ${String(data.version)}`);
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  const str = (v: unknown) => typeof v === 'string';
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const arr = <T,>(v: unknown, name: string, ok: (e: unknown) => boolean): T[] => {
    if (!Array.isArray(v)) throw new Error(`バックアップの ${name} が配列ではありません`);
    const limit = BACKUP_LIMITS[name as keyof typeof BACKUP_LIMITS];
    if (limit !== undefined && v.length > limit) throw new Error(`バックアップの ${name} が上限（${limit}件）を超えています`);
    v.forEach((e, i) => { if (!ok(e)) throw new Error(`バックアップの ${name}[${i}] の形式が不正です`); });
    return v as T[];
  };
  const parsed: AppState = {
    attempts: arr<StudyAttempt>(data.attempts, 'attempts', e => isObj(e) && str(e.questionId) && typeof e.correct === 'boolean' && num(e.answeredAt) && Array.isArray(e.selectedIds) && e.selectedIds.every(s => typeof s === 'string')),
    schedule: arr<ReviewScheduleItem>(data.schedule, 'schedule', e => isObj(e) && str(e.questionId) && num(e.ease) && (e.ease as number) >= 1.0 && (e.ease as number) <= 3.0 && num(e.intervalDays) && (e.intervalDays as number) >= 0 && (e.intervalDays as number) <= 3650 && num(e.repetitions) && Number.isInteger(e.repetitions) && (e.repetitions as number) >= 0 && num(e.dueAt)),
    bookmarks: arr<Bookmark>(data.bookmarks, 'bookmarks', e => isObj(e) && str(e.lessonId) && num(e.createdAt)),
    notes: arr<Note>(data.notes, 'notes', e => isObj(e) && str(e.id) && str(e.lessonId) && str(e.text) && num(e.updatedAt)),
    virtual: arr<VirtualRecord>(data.virtual, 'virtual', e => isObj(e) && str(e.caseId) && num(e.score) && num(e.doneAt) && isObj(e.chosen) && Object.values(e.chosen).every(v => Array.isArray(v) && v.every(s => typeof s === 'string'))),
  };
  const seenQ = new Set<string>();
  for (const s of parsed.schedule) { if (seenQ.has(s.questionId)) throw new Error(`バックアップの schedule に重複があります: ${s.questionId}`); seenQ.add(s.questionId); }
  return parsed;
}

/** 復元前の確認表示用サマリ（監査指摘 P1: 復元は件数プレビューと確認を挟んでから実行する） */
export function summarizeBackup(state: AppState): string {
  return `回答履歴 ${state.attempts.length}件・復習スケジュール ${state.schedule.length}件・ブックマーク ${state.bookmarks.length}件・メモ ${state.notes.length}件・仮想投資記録 ${state.virtual.length}件`;
}
export async function replaceState(state: AppState): Promise<void> { await persistAll(state); }
export async function wipeState(): Promise<AppState> { const e = emptyState(); await persistAll(e); return e; }
