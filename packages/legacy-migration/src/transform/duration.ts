/**
 * `horas_voluntariado.horas` is a MySQL `TIME` used as a **duration**, not a
 * wall-clock time — unlike `saidas`' five occurrence columns, there is no
 * midnight to roll over and no reason to cap the hour component at 24. A
 * long shift legitimately reads `"30:15:00"`.
 */
export function timeStringToMinutes(time: string): number {
  const [hours, minutes, seconds] = time.split(':').map((part) => Number.parseInt(part, 10));
  return hours * 60 + (minutes || 0) + Math.round((seconds || 0) / 60);
}
