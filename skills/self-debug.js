'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BUG_FILE = path.join(DATA_DIR, 'bug-report.json');
const KB_FILE = path.join(DATA_DIR, 'knowledge-base.json');

function now() {
  return new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000)
    .toISOString().slice(0, 16).replace('T', ' ');
}

// ── File helpers ──────────────────────────────────────────────────────────────

function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadBugs() { return loadJSON(BUG_FILE, []); }
function saveBugs(d) { saveJSON(BUG_FILE, d); }
function loadKB() {
  return loadJSON(KB_FILE, {
    known_bugs: {}, prevention_rules: [], best_practices: [],
    edge_cases: [], error_patterns: {}, session_count: 0, task_count: 0,
  });
}
function saveKB(d) { saveJSON(KB_FILE, d); }

// ── Bug logging ───────────────────────────────────────────────────────────────

function logBug({ errorType, location, cause, input, fixApplied = null, testResult = null }) {
  const bugs = loadBugs();
  const id = `BUG-${String(bugs.length + 1).zfill ? String(bugs.length + 1) : (bugs.length + 1)}`.padStart(7, 'BUG-000');
  const bugId = `BUG-${String(bugs.length + 1).padStart(4, '0')}`;
  const entry = {
    bug_id: bugId, date: now(),
    error_type: errorType, location, root_cause: cause,
    input: typeof input === 'string' ? input : JSON.stringify(input).slice(0, 200),
    fix_applied: fixApplied, test_result: testResult,
    prevention_rule: null,
  };
  bugs.push(entry);
  saveBugs(bugs);

  // Track error patterns for auto-rule generation
  const kb = loadKB();
  kb.error_patterns[errorType] = (kb.error_patterns[errorType] || 0) + 1;

  // 3+ occurrences of same error → auto-generate prevention rule
  if (kb.error_patterns[errorType] >= 3) {
    const rule = `AUTO: Validate before ${errorType} — seen ${kb.error_patterns[errorType]}x`;
    const alreadyExists = kb.prevention_rules.some(r => r.error_type === errorType);
    if (!alreadyExists) {
      kb.prevention_rules.push({ error_type: errorType, rule, auto_generated: true, date: now() });
      entry.prevention_rule = rule;
      saveBugs(bugs);
    }
  }
  saveKB(kb);
  return bugId;
}

// ── Prevention rules ──────────────────────────────────────────────────────────

function checkPreventionRules(context) {
  const kb = loadKB();
  const matched = [];
  for (const r of kb.prevention_rules) {
    if (context.errorType && r.error_type === context.errorType) matched.push(r.rule);
    if (context.tipe && r.rule.toLowerCase().includes(context.tipe.toLowerCase())) matched.push(r.rule);
  }
  return matched.length ? matched[0] : null;
}

function addPreventionRule(errorType, rule) {
  const kb = loadKB();
  if (!kb.prevention_rules.some(r => r.error_type === errorType && r.rule === rule)) {
    kb.prevention_rules.push({ error_type: errorType, rule, auto_generated: false, date: now() });
    saveKB(kb);
  }
}

// ── Experience logging ────────────────────────────────────────────────────────

function logExperience({ taskType, happened, worked, failed, lesson, ruleUpdated = false }) {
  const kb = loadKB();
  kb.task_count = (kb.task_count || 0) + 1;

  // Keep last 100 experiences only
  if (!kb.experience_log) kb.experience_log = [];
  kb.experience_log.push({
    session_id: `SESS-${kb.task_count}`, date: now(),
    task_type: taskType, what_happened: happened,
    what_worked: worked, what_failed: failed,
    lesson_learned: lesson, rule_updated: ruleUpdated,
  });
  if (kb.experience_log.length > 100) kb.experience_log = kb.experience_log.slice(-100);

  // Best practice tracking
  if (worked && !failed) {
    const bp = `${taskType}: ${worked}`;
    if (!kb.best_practices.includes(bp)) kb.best_practices.push(bp);
    if (kb.best_practices.length > 50) kb.best_practices = kb.best_practices.slice(-50);
  }

  saveKB(kb);
  return kb.task_count;
}

// ── Performance review ────────────────────────────────────────────────────────

function getPerformanceReview() {
  const kb = loadKB();
  const bugs = loadBugs();
  const fixed = bugs.filter(b => b.test_result === 'PASSED').length;
  const success = kb.task_count > 0
    ? Math.round(((kb.task_count - bugs.length) / kb.task_count) * 100) : 100;
  return {
    total_tasks: kb.task_count || 0,
    bugs_found: bugs.length,
    bugs_fixed: fixed,
    prevention_rules: kb.prevention_rules.length,
    best_practices: kb.best_practices.length,
    success_rate: success,
    areas_to_improve: bugs.filter(b => !b.fix_applied).map(b => b.error_type).slice(0, 3),
  };
}

// ── Increment session counter ─────────────────────────────────────────────────

function newSession() {
  const kb = loadKB();
  kb.session_count = (kb.session_count || 0) + 1;
  saveKB(kb);
  return kb.session_count;
}

module.exports = {
  logBug, checkPreventionRules, addPreventionRule,
  logExperience, getPerformanceReview, newSession, loadKB,
};
