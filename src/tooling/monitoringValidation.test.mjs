import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildValidationPlan,
  parseOptions,
  readTestSummary,
  runCheck,
  runValidation,
} from '../../scripts/validate-monitoring.mjs';
import { ALLOCATION_TEST_FILES } from '../../scripts/run-unit-tests.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const tap =
  '# tests 2\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n';
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'gev-validation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const check = {
  id: 'test',
  label: 'Tests',
  command: process.execPath,
  args: ['--test'],
  testSummary: true,
};

test('validation options reject unknown switches and incomplete output paths', () => {
  assert.deepEqual(parseOptions([]), {
    full: false,
    out: 'validation-output',
    help: false,
  });
  assert.deepEqual(parseOptions(['--full', '--out', 'reports with spaces']), {
    full: true,
    out: 'reports with spaces',
    help: false,
  });
  assert.equal(parseOptions(['--help']).help, true);
  for (const args of [['--typo'], ['--out'], ['--out', '--full']])
    assert.throws(() => parseOptions(args));
});

test('full validation partitions allocations into isolated serial invocations', () => {
  const plan = buildValidationPlan(root, { full: true });
  const ordinary = plan.find((item) => item.id === 'ordinary');
  const allocations = plan.filter((item) => item.id.startsWith('allocation-'));
  assert.equal(allocations.length, 2);
  for (const [index, item] of allocations.entries()) {
    assert.equal(item.args.at(-1), ALLOCATION_TEST_FILES[index]);
    assert.ok(item.args.includes('--expose-gc'));
    assert.ok(item.args.includes('--test-concurrency=1'));
    assert.ok(item.args.indexOf('--test-reporter=tap') < item.args.length - 1);
    assert.ok(!ordinary.args.includes(ALLOCATION_TEST_FILES[index]));
  }
  const focused = buildValidationPlan(root);
  assert.ok(focused.find((item) => item.id === 'full-suite').notRunReason);
  assert.ok(focused.find((item) => item.id === 'browser').notRunReason);
});

test('zero exit without a completed nonempty test summary cannot pass', (t) => {
  const directory = fixture(t);
  for (const output of [
    '',
    '# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
    '# tests 3\n',
  ]) {
    const result = runCheck(check, {
      root,
      directory,
      execute(_cmd, _args, options) {
        writeSync(options.stdio[1], output);
        return { status: 0 };
      },
    });
    assert.equal(result.status, 'FAIL');
    assert.match(result.reason, /summary/);
  }
  assert.equal(readTestSummary('incomplete'), null);
});

test('summary failures, cancellations, process errors and signals override exit zero', (t) => {
  const directory = fixture(t);
  for (const [output, processResult] of [
    [tap.replace('# fail 0', '# fail 1'), { status: 0 }],
    [tap.replace('# cancelled 0', '# cancelled 1'), { status: 0 }],
    [tap, { status: 1 }],
    [tap, { status: null, signal: 'SIGTERM' }],
    [tap, { status: null, error: new Error('spawn failed') }],
  ]) {
    const result = runCheck(check, {
      root,
      directory,
      execute(_cmd, _args, options) {
        writeSync(options.stdio[1], output);
        return processResult;
      },
    });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.reason);
  }
});

test('successful summary retains skip count and log; blocked/unrequested checks never execute', (t) => {
  const directory = fixture(t);
  const result = runCheck(check, {
    root,
    directory,
    execute(_cmd, _args, options) {
      writeSync(options.stdio[1], tap);
      return { status: 0 };
    },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.summary.skipped, 1);
  assert.equal(readFileSync(path.join(directory, result.log), 'utf8'), tap);
  const unexpected = () => assert.fail('must not execute');
  assert.equal(
    runCheck(
      { ...check, notRunReason: 'manual' },
      { root, directory, execute: unexpected },
    ).status,
    'NOT RUN',
  );
  assert.equal(
    runCheck(
      { ...check, blockedReason: 'runtime' },
      { root, directory, execute: unexpected },
    ).status,
    'BLOCKED',
  );
});

test('validation continues after failure, saves reports, and keeps manual acceptance pending', (t) => {
  const directory = fixture(t);
  const calls = [];
  const execute = (command, args, options) => {
    calls.push(args);
    if (options.encoding)
      return {
        status: 0,
        stdout: args[0] === 'rev-parse' ? 'abc123\n' : ' M TODO.md\n',
      };
    if (args.includes('--test-reporter=tap')) writeSync(options.stdio[1], tap);
    return { status: args.includes('build') ? 1 : 0 };
  };
  const result = runValidation({
    root,
    options: { out: directory, full: false },
    execute,
    log() {},
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.dirty, true);
  assert.equal(
    result.report.checks.find((item) => item.id === 'build').status,
    'FAIL',
  );
  assert.equal(
    result.report.checks.find((item) => item.id === 'whitespace').status,
    'PASS',
  );
  assert.equal(
    result.report.checks.find((item) => item.id === 'acceptance').status,
    'NOT RUN',
  );
  assert.ok(calls.some((args) => args.includes('--check')));
  const saved = JSON.parse(
    readFileSync(path.join(result.directory, 'report.json'), 'utf8'),
  );
  assert.equal(saved.commit, 'abc123');
  assert.equal(saved.verdict, 'CHECKS REQUIRE ATTENTION');
  assert.match(
    readFileSync(path.join(result.directory, 'report.md'), 'utf8'),
    /Manual acceptance remains pending/,
  );
  const again = runValidation({
    root,
    options: { out: directory },
    execute,
    log() {},
  });
  assert.notEqual(
    result.directory,
    again.directory,
    'new runs cannot overwrite earlier evidence',
  );
});
