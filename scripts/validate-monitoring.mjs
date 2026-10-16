#!/usr/bin/env node
/** Local validation evidence; never commits, installs dependencies or contacts live feeds. */
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  allocationTestArgs,
  buildUnitTestPlan,
  discoverUnitTestFiles,
  isCalibratedAllocationRuntime,
} from './run-unit-tests.mjs';

export const BASE_REF = '537e99dfa45a3f7b239ad6230a65be658b3ea29d';
const focusedFiles = [
  'src/tooling/monitoringValidation.test.mjs',
  'src/tools/tool-schema-codepoints.test.mjs',
  'src/monitoring/monitoring.test.mjs',
  'src/ui/monitoringPanel.test.mjs',
  'src/ui/layerPanel.test.mjs',
  'src/layers/flights/ingestion.test.mjs',
  'src/data/aisWatchdog.test.mjs',
  'src/data/aisStreamAdapter.test.mjs',
  'src/data/aisWatchdogTransport.test.mjs',
  'src/data/aisStreamSentinels.test.mjs',
  'src/data/aisLiveVessels.test.mjs',
  'src/data/aisLiveVessels.analyst.test.mjs',
  'src/sources/live/contract.test.mjs',
  'src/layers/vessels/ownership.test.mjs',
  'src/tooling/liveProviders.test.mjs',
  'server/providers/monitoringNews.test.mjs',
  'server/providers/monitoringFeeds.test.mjs',
  'server/providers/monitoringFeedXml.test.mjs',
  'src/layers/satellites/health.test.mjs',
  'server/providers/space/celestrak.test.mjs',
  'src/layers/earthquakes/ownership.test.mjs',
  'src/data/manager.test.mjs',
  'src/data/layerSnapshot.test.mjs',
  'src/services/requests.test.mjs',
];

export function parseOptions(args) {
  const options = { full: false, out: 'validation-output', help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--full') options.full = true;
    else if (args[i] === '--help') options.help = true;
    else if (args[i] === '--out') {
      if (!args[i + 1] || args[i + 1].startsWith('--'))
        throw new Error('--out requires a directory');
      options.out = args[++i];
    } else throw new Error(`Unknown option: ${args[i]}`);
  }
  return options;
}

export function buildValidationPlan(root, { full = false } = {}) {
  const node = (id, label, args, extra = {}) => ({
    id,
    label,
    command: process.execPath,
    args,
    ...extra,
  });
  const tests = (id, label, files, extra = {}) =>
    node(
      id,
      label,
      ['--test', '--test-reporter=tap', '--test-concurrency=8', ...files],
      { testSummary: true, ...extra },
    );
  const plan = [];
  if (full) {
    const unit = buildUnitTestPlan(discoverUnitTestFiles(root));
    plan.push(tests('ordinary', 'Full ordinary test suite', unit.parallel));
    for (const [index, file] of unit.serializedAllocations.entries()) {
      const args = allocationTestArgs(file);
      args.splice(1, 0, '--test-reporter=tap');
      plan.push(
        node(`allocation-${index + 1}`, `Allocation probe: ${file}`, args, {
          testSummary: true,
          blockedReason: isCalibratedAllocationRuntime()
            ? null
            : 'Allocation budgets require Node 24; run this gate on the calibrated runtime.',
        }),
      );
    }
  } else {
    plan.push(tests('focused', 'Focused monitoring regressions', focusedFiles));
    plan.push({
      id: 'full-suite',
      label: 'Full ordinary suite and allocation probes',
      notRunReason: 'Not requested. Use --full on Node 24.',
    });
  }
  plan.push(
    node('build', 'Production build', [
      'node_modules/vite/bin/vite.js',
      'build',
    ]),
    node('format', 'Adopted formatting', ['scripts/format.mjs', '--check']),
    node('imports', 'Import directions', [
      'scripts/check-import-directions.mjs',
    ]),
    node('packages', 'Package boundaries', [
      'scripts/check-package-boundaries.mjs',
    ]),
    node('tokens', 'Layer-token compatibility', [
      'scripts/check-layer-state-tokens.mjs',
      '--base-ref',
      BASE_REF,
    ]),
    {
      id: 'whitespace',
      label: 'Git whitespace',
      command: 'git',
      args: ['diff', '--check'],
    },
    {
      id: 'browser',
      label: 'Browser fixture gate',
      notRunReason:
        'Run separately with a working local Chrome and dev-server URL; see the runbook.',
    },
    {
      id: 'acceptance',
      label: 'Manual browser / GPU / live feeds / long session',
      notRunReason:
        'Requires observation on the user machine; record in docs/VALIDATION-RESULTS.md.',
    },
  );
  return plan;
}

/** TAP totals are required as well as an exit code; silent exits are not passes. */
export function readTestSummary(log) {
  const fields = {};
  for (const line of log.split(/\r?\n/)) {
    const match = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/.exec(
      line,
    );
    if (match) fields[match[1]] = Number(match[2]);
  }
  return ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every(
    (key) => Number.isSafeInteger(fields[key]),
  )
    ? fields
    : null;
}

export function runCheck(check, { root, directory, execute = spawnSync }) {
  if (check.notRunReason)
    return { ...check, status: 'NOT RUN', reason: check.notRunReason };
  if (check.blockedReason)
    return { ...check, status: 'BLOCKED', reason: check.blockedReason };
  const started = Date.now();
  const log = `${check.id}.log`;
  const fd = openSync(path.join(directory, log), 'w');
  let result;
  try {
    result = execute(check.command, check.args, {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: '0', NODE_DISABLE_COLORS: '1' },
      stdio: ['ignore', fd, fd],
      timeout: 30 * 60 * 1000,
    });
  } catch (error) {
    result = { status: null, error };
  } finally {
    closeSync(fd);
  }
  const summary = check.testSummary
    ? readTestSummary(readFileSync(path.join(directory, log), 'utf8'))
    : null;
  let reason =
    result.error?.message ||
    (result.signal ? `Terminated by ${result.signal}` : null);
  if (!reason && result.status !== 0)
    reason = `Exit status ${result.status ?? 'unknown'}`;
  if (!reason && check.testSummary && (!summary || summary.tests === 0))
    reason = 'Missing or empty final test summary; success is not established.';
  if (!reason && summary && (summary.fail > 0 || summary.cancelled > 0))
    reason = 'Test summary contains failures or cancellations.';
  return {
    ...check,
    status: reason ? 'FAIL' : 'PASS',
    reason,
    exitCode: result.status ?? null,
    signal: result.signal ?? null,
    durationMs: Date.now() - started,
    log,
    ...(summary ? { summary } : {}),
  };
}

export function reportMarkdown(report) {
  const clean = (value) =>
    String(value ?? '')
      .replaceAll('|', '\\|')
      .replace(/\r?\n/g, ' ');
  return [
    '# Monitoring validation report',
    '',
    `Started: ${report.startedAt}`,
    `Commit: ${report.commit ?? 'unknown'}`,
    `Working tree: ${report.dirty == null ? 'unknown' : report.dirty ? 'uncommitted changes present' : 'clean'}`,
    `Runtime: Node ${report.node}; ${report.platform}; mode: ${report.mode}`,
    '',
    `Automated verdict: **${report.verdict}**. Manual acceptance remains pending.`,
    '',
    '| Check | Status | Evidence / reason |',
    '| --- | --- | --- |',
    ...report.checks.map(
      (check) =>
        `| ${clean(check.label)} | ${check.status} | ${check.log ? `[log](${check.log}) ` : ''}${clean(check.reason)}${check.summary ? ` (${check.summary.pass} passed, ${check.summary.skipped} skipped, ${check.summary.fail} failed)` : ''} |`,
    ),
    '',
    'PASS applies only to the named check. NOT RUN is not a pass. The default focused mode does not establish full-suite or allocation acceptance.',
    'Logs stay local and may include local paths or diagnostics. Review/redact them before sharing; no environment variables or configuration files are deliberately collected.',
    'Manual steps and the results template: docs/VALIDATION-RUNBOOK.md and docs/VALIDATION-RESULTS.md.',
    '',
  ].join('\n');
}

export function runValidation({
  root,
  options,
  execute = spawnSync,
  log = console.log,
}) {
  const output = path.resolve(root, options.out);
  mkdirSync(output, { recursive: true });
  const directory = mkdtempSync(path.join(output, 'run-'));
  const metadata = (args) => {
    const result = execute('git', args, { cwd: root, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const status = metadata(['status', '--porcelain']);
  const report = {
    startedAt: new Date().toISOString(),
    commit: metadata(['rev-parse', 'HEAD']),
    dirty: status == null ? null : Boolean(status),
    node: process.versions.node,
    platform: process.platform,
    mode: options.full ? 'full' : 'focused',
    verdict: 'INCOMPLETE',
    checks: buildValidationPlan(root, options).map((check) => ({
      ...check,
      status: 'NOT RUN',
    })),
  };
  const save = () => {
    writeFileSync(
      path.join(directory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    writeFileSync(path.join(directory, 'report.md'), reportMarkdown(report));
  };
  save();
  for (let index = 0; index < report.checks.length; index++) {
    const check = report.checks[index];
    log(`Checking: ${check.label}`);
    report.checks[index] = runCheck(check, { root, directory, execute });
    log(
      `  ${report.checks[index].status}${report.checks[index].reason ? `: ${report.checks[index].reason}` : ''}`,
    );
    save();
  }
  const failed = report.checks.some((check) =>
    ['FAIL', 'BLOCKED'].includes(check.status),
  );
  report.verdict = failed
    ? 'CHECKS REQUIRE ATTENTION'
    : 'REQUESTED AUTOMATED CHECKS PASSED';
  report.finishedAt = new Date().toISOString();
  save();
  log(`Report: ${path.join(directory, 'report.md')}`);
  log('Manual/browser acceptance remains pending.');
  return { directory, report, exitCode: failed ? 1 : 0 };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) {
      console.log(
        'Usage: npm run validate:monitoring -- [--full] [--out DIRECTORY]\nDefault: focused tests, build and quality gates. --full: ordinary suite plus serialized allocation probes. Reports are local; manual acceptance is separate.',
      );
    } else {
      const root = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
      );
      process.exitCode = runValidation({ root, options }).exitCode;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
