// データモデル（指示書 §14）。教材・問題・制度・学習記録の型をここに集約する。
export type DomainId = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L'|'M'|'N';
export type Level = 1|2|3; // 1=基礎 2=中級 3=上級（大学レベル）
export type ReviewStatus = 'verified'|'draft';
/** 知識の性質の区別（指示書 §3） */
export type EpistemicKind = 'fact'|'theory'|'assumption'|'inference'|'hypothesis'|'forecast';

export interface SourceReference {
  title: string;
  publisher: string;
  url: string;
  checkedAt: string; // YYYY-MM-DD
  note?: string;
}

export interface Domain {
  id: DomainId;
  name: string;
  summary: string;
}

export interface Lesson {
  id: string; // 永続ID 例: A-01
  domainId: DomainId;
  title: string;
  version: number;
  level: Level;
  prerequisites: string[];
  objectives: string[];
  terms: string[];
  layers: {
    overview: string;
    detail: string;
    theory: string; // 数式は「式: ... ／ 変数: ... ／ 条件: ...」形式で本文中に明記
    practice: string; // 計算例は検証済み数値のみ
  };
  misconceptions: string[];
  related: string[];
  questionIds: string[];
  sources: SourceReference[];
  reviewStatus: ReviewStatus;
}

export type QuestionType = 'single'|'multi';
export interface AnswerOption { id: string; text: string; }
export interface Question {
  id: string; // 例: Q-A01-1
  lessonId: string;
  type: QuestionType;
  difficulty: Level;
  skill: 'understand'|'compare'|'calculate'|'apply'|'find-error';
  prompt: string;
  options: AnswerOption[];
  correctIds: string[];
  explanation: string;
  wrongExplanations: Record<string, string>; // optionId -> その選択肢が誤りである理由（正答分は任意）
  assumptions?: string;
  sources: SourceReference[];
  reviewStatus: ReviewStatus;
}

export interface RegulationVersion {
  id: string;
  name: string;
  jurisdiction: string;
  status: 'in-force'|'enacted-not-yet'|'proposal';
  announcedAt?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  appliesTo: string;
  keyNumbers: { label: string; value: string }[];
  source: SourceReference;
  version: number;
  history: string;
}

export interface CaseStudy {
  id: string;
  title: string;
  kind: 'fictional-company'|'fictional-crypto'|'historical';
  decisionDate: string; // この日付より後の情報は判断材料に表示しない
  briefing: string; // decisionDate 時点で公開済みの情報のみ
  seriesLabel: string;
  series: { date: string; value: number }[]; // 全期間。UIは decisionDate までを先に表示
  criteria: {
    id: string;
    prompt: string;
    options: AnswerOption[];
    goodIds: string[]; // 複数の妥当な回答を許容
    rationale: string;
  }[];
  postNote: string; // 事後の振り返り（価格的中は採点しない旨を含む）
}

export interface StudyAttempt {
  questionId: string;
  selectedIds: string[];
  correct: boolean;
  answeredAt: number;
}
export interface ReviewScheduleItem {
  questionId: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: number;
  lastReviewedAt: number;
}
export interface Bookmark { lessonId: string; createdAt: number; }
export interface Note { id: string; lessonId: string; text: string; updatedAt: number; }
export interface VirtualRecord { caseId: string; chosen: Record<string, string[]>; score: number; doneAt: number; }

export interface BackupData {
  format: 'finance-literacy-master-backup';
  version: 1;
  exportedAt: string;
  attempts: StudyAttempt[];
  schedule: ReviewScheduleItem[];
  bookmarks: Bookmark[];
  notes: Note[];
  virtual: VirtualRecord[];
}
