import { LESSONS } from '../src/content/index.ts';
import { DOMAINS } from '../src/content/domains.ts';
let out = `# COVERAGE.md — 教材・問題の対応表（自動生成）\n\n生成方法: \`npx tsx scripts/gen-coverage.ts\`（教材データを正本として再生成する）\n\n| 分野 | 教材 | 難易度 | 到達目標 | 問題 | 検証状態 | 出典数 |\n|------|------|--------|----------|------|----------|--------|\n`;
for (const d of DOMAINS) {
  for (const l of LESSONS.filter(x => x.domainId === d.id)) {
    out += `| ${d.id}. ${d.name} | ${l.id} ${l.title} | ${l.level} | ${l.objectives.length} | ${l.questionIds.join(', ')} | ${l.reviewStatus} | ${l.sources.length} |\n`;
  }
}
out += `\n合計: 教材 ${LESSONS.length}、問題 ${LESSONS.reduce((s, l) => s + l.questionIds.length, 0)}\n`;
console.log(out);
