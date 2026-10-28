import { DUMMY_ASSIGNABLE_NAMES, type AssignableUser } from "@/lib/assignees";

export const ATTENDANCE_STORAGE_KEY = "evecture.attendance.v1";

export type AttendanceStatus = "PRESENT" | "REMOTE" | "HALF_DAY" | "ON_LEAVE" | "ABSENT";

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  REMOTE: "Remote",
  HALF_DAY: "Half Day",
  ON_LEAVE: "On Leave",
  ABSENT: "Absent",
};

export type AttendanceRecord = {
  id: string; // `${date}-${userIdOrName}`
  userId?: string;
  userName: string;
  userEmail?: string;
  userRole?: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkInTime?: string; // e.g. "09:00 AM"
  checkOutTime?: string; // e.g. "06:00 PM"
  hoursLogged?: number;
  notes?: string;
  updatedAt: string;
};

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function readAttendanceRecords(): AttendanceRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ATTENDANCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Sanitize records to eliminate any dummy names
    return parsed.filter((record: AttendanceRecord) => {
      const name = record.userName?.trim().toLowerCase();
      return name && !DUMMY_ASSIGNABLE_NAMES.has(name);
    });
  } catch {
    return [];
  }
}

export function writeAttendanceRecords(records: AttendanceRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new Event("evecture:attendance-updated"));
  } catch (err) {
    console.warn("Failed to persist attendance records", err);
  }
}

export function saveAttendanceRecord(record: AttendanceRecord): void {
  const existing = readAttendanceRecords();
  const index = existing.findIndex(
    (item) => item.date === record.date && item.userName.toLowerCase() === record.userName.toLowerCase()
  );
  if (index >= 0) {
    existing[index] = { ...existing[index], ...record, updatedAt: new Date().toISOString() };
  } else {
    existing.push({ ...record, updatedAt: new Date().toISOString() });
  }
  writeAttendanceRecords(existing);
}

/**
 * Generates seed attendance data for real users for the past N days if no data exists.
 */
export function initializeAttendanceForUsers(users: AssignableUser[], daysBack = 14): AttendanceRecord[] {
  const validUsers = users.filter((u) => u.name?.trim() && !DUMMY_ASSIGNABLE_NAMES.has(u.name.trim().toLowerCase()));
  if (validUsers.length === 0) return [];

  const existing = readAttendanceRecords();
  const dates: string[] = [];
  const today = new Date();

  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // Skip Sundays
    if (d.getDay() === 0) continue;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
  }

  let updated = false;
  const newRecords: AttendanceRecord[] = [...existing];

  for (const date of dates) {
    for (let uIdx = 0; uIdx < validUsers.length; uIdx++) {
      const user = validUsers[uIdx];
      const hasRecord = newRecords.some(
        (r) => r.date === date && r.userName.toLowerCase() === user.name.toLowerCase()
      );
      if (!hasRecord) {
        // Deterministic default status based on user index & date
        const isToday = date === getTodayDateString();
        let status: AttendanceStatus = "PRESENT";
        let checkIn = "09:00 AM";
        let checkOut = isToday ? undefined : "06:00 PM";
        let hours = isToday ? 4.5 : 8.0;

        const dayNum = parseInt(date.slice(-2), 10);
        if ((dayNum + uIdx) % 7 === 0) {
          status = "REMOTE";
          checkIn = "09:15 AM";
          checkOut = isToday ? undefined : "06:15 PM";
          hours = 8.0;
        } else if ((dayNum + uIdx) % 13 === 0 && !isToday) {
          status = "HALF_DAY";
          checkIn = "09:00 AM";
          checkOut = "01:30 PM";
          hours = 4.5;
        }

        newRecords.push({
          id: `att-${date}-${user.name.toLowerCase().replace(/\s+/g, "-")}`,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userRole: user.role,
          date,
          status,
          checkInTime: checkIn,
          checkOutTime: checkOut,
          hoursLogged: hours,
          updatedAt: new Date().toISOString(),
        });
        updated = true;
      }
    }
  }

  if (updated) {
    writeAttendanceRecords(newRecords);
  }

  return newRecords;
}

export function getUserAttendanceSummary(userName: string, records: AttendanceRecord[], daysWindow = 30) {
  const needle = userName.toLowerCase().trim();
  const userRecords = records.filter((r) => r.userName.toLowerCase().trim() === needle);

  const total = userRecords.length;
  const present = userRecords.filter((r) => r.status === "PRESENT").length;
  const remote = userRecords.filter((r) => r.status === "REMOTE").length;
  const halfDay = userRecords.filter((r) => r.status === "HALF_DAY").length;
  const onLeave = userRecords.filter((r) => r.status === "ON_LEAVE").length;
  const absent = userRecords.filter((r) => r.status === "ABSENT").length;

  const totalHours = userRecords.reduce((acc, r) => acc + (r.hoursLogged || 0), 0);
  const activeDays = present + remote + (halfDay * 0.5);
  const rate = total > 0 ? Math.round((activeDays / total) * 100) : 100;

  return {
    totalRecords: total,
    presentDays: present,
    remoteDays: remote,
    halfDays: halfDay,
    leaveDays: onLeave,
    absentDays: absent,
    activeDays,
    attendanceRate: rate,
    totalHours: Math.round(totalHours * 10) / 10,
  };
}
