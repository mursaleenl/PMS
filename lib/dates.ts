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
