/**
 * `migration/out/rejects-<entity>.csv` — one file per entity that had any
 * rejected row, streamed so a run that dies partway through still leaves
 * whatever it found up to that point (plan §7).
 */
import { WriteStream, createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';

export interface RejectRow {
  legacyKey: string;
  reasonCode: string;
  reason: string;
  field?: string;
  /** Blank for a `SENSITIVE_AUDIT_FIELDS` field or free-text clinical content — never the raw value. */
  valueRedacted?: string;
}

const HEADER = 'legacy_key,reason_code,reason,field,value_redacted\n';

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export class RejectWriter {
  private readonly streams = new Map<string, WriteStream>();

  constructor(private readonly outDir: string) {
    mkdirSync(outDir, { recursive: true });
  }

  write(entity: string, row: RejectRow): void {
    let stream = this.streams.get(entity);
    if (!stream) {
      stream = createWriteStream(join(this.outDir, `rejects-${entity}.csv`), { flags: 'w' });
      stream.write(HEADER);
      this.streams.set(entity, stream);
    }
    const line = [row.legacyKey, row.reasonCode, row.reason, row.field ?? '', row.valueRedacted ?? '']
      .map((value) => csvEscape(String(value)))
      .join(',');
    stream.write(`${line}\n`);
  }

  /** Every entity that had at least one reject — what `report.md` lists a CSV for. */
  entitiesWritten(): string[] {
    return [...this.streams.keys()];
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.streams.values()].map(
        (stream) =>
          new Promise<void>((resolve, reject) => {
            stream.end((err?: Error) => (err ? reject(err) : resolve()));
          }),
      ),
    );
  }
}
