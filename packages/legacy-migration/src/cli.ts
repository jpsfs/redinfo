/**
 * argv → `RunOptions`. Pure parsing — no `fs`, no `process.exit` — so it can
 * be unit-tested and so `main.ts` stays the only file with side effects.
 *
 * `--dry-run` is the default precisely so a bare `migrate:legacy` can never
 * write anything: the loader is safe to run against a real target database
 * with no flags at all, which is what makes "just try it" a reasonable thing
 * to tell an operator to do.
 */
export interface RunOptions {
  /** `true` commits; `false` (the default) computes and rolls back — see `upsert-engine.ts::DryRunRollback`. */
  apply: boolean;
  batchSize: number;
  /** `null` = every loader. Otherwise the loader-file basenames, e.g. `["01-users", "03-vehicles"]`. */
  only: string[] | null;
  /** `YYYY-MM-DD`, or `null` for no restriction. */
  since: string | null;
  createHospitals: boolean;
  /**
   * Delete rows legacy has since dropped (`prune.ts`). On by default —
   * "legacy always wins" is not true while a retraction there leaves a stale
   * row here — with `--no-prune` as the escape hatch for a run that must not
   * remove anything.
   */
  prune: boolean;
  failOnReject: boolean;
  outDir: string;
  runId: string;
  verbose: boolean;
}

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_OUT_DIR = 'migration/out';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParseCliArgsDeps {
  /** Injected for a deterministic default `runId` in tests. */
  now?: () => Date;
  gitShortSha?: string;
}

export function parseCliArgs(argv: string[], deps: ParseCliArgsDeps = {}): RunOptions {
  const now = deps.now ?? (() => new Date());
  const gitShortSha = deps.gitShortSha ?? 'nogit';

  let dryRunFlag = false;
  let applyFlag = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  let only: string[] | null = null;
  let since: string | null = null;
  let createHospitals = false;
  let prune = true;
  let failOnReject = false;
  let outDir = DEFAULT_OUT_DIR;
  let runId: string | null = null;
  let verbose = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[i];
    };

    switch (arg) {
      case '--dry-run':
        dryRunFlag = true;
        break;
      case '--apply':
        applyFlag = true;
        break;
      case '--batch-size': {
        const value = Number.parseInt(next(), 10);
        if (!Number.isInteger(value) || value <= 0) throw new Error('--batch-size must be a positive integer.');
        batchSize = value;
        break;
      }
      case '--only':
        only = next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--since': {
        const value = next();
        if (!ISO_DATE.test(value)) throw new Error('--since must be YYYY-MM-DD.');
        since = value;
        break;
      }
      case '--create-hospitals':
        createHospitals = true;
        break;
      case '--no-prune':
        prune = false;
        break;
      case '--fail-on-reject':
        failOnReject = true;
        break;
      case '--out':
        outDir = next();
        break;
      case '--run-id':
        runId = next();
        break;
      case '--verbose':
        verbose = true;
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (dryRunFlag && applyFlag) {
    throw new Error('--dry-run and --apply are mutually exclusive — pass at most one.');
  }

  return {
    apply: applyFlag,
    batchSize,
    only,
    since,
    createHospitals,
    prune,
    failOnReject,
    outDir,
    runId: runId ?? `${now().toISOString()}-${gitShortSha}`,
    verbose,
  };
}

/** Whether a loader named `id` (its file's numeric-prefixed basename) should run this pass. */
export function loaderIsSelected(id: string, only: string[] | null): boolean {
  return only === null || only.includes(id);
}
