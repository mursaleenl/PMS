export function isValidDateValue(value: string, includeTime = false) {
  const pattern = includeTime ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value)) return false;
  const [date,time] = value.split("T");
  const [year,month,day] = date.split("-").map(Number);
  const parsed = new Date(year,month-1,day);
  if (parsed.getFullYear()!==year || parsed.getMonth()!==month-1 || parsed.getDate()!==day) return false;
  if (includeTime) { const [hour,minute]=time.split(":").map(Number); return hour<24 && minute<60; }
  return true;
}

export function taskDeadlineFromInput(value: string): string | undefined {
  if (!value.trim()) return undefined;
  if (!isValidDateValue(value, true)) throw new Error("Choose a valid deadline date and time.");
  return new Date(value).toISOString();
}
export function taskDeadlineInput(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
