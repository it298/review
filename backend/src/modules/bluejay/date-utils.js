export const TIMEZONE = process.env.BLUEJAY_TIMEZONE || "Asia/Ho_Chi_Minh";

function partsInTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

export function todayLocal(date = new Date()) {
  const p = partsInTimeZone(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function currentMonthLocal(date = new Date()) {
  return todayLocal(date).slice(0, 7);
}

export function apiWindowStatus(date = new Date()) {
  const p = partsInTimeZone(date);
  const hour = Number(p.hour);
  const minute = Number(p.minute);

  let allowed = false;
  let label = "Ngoài khung giờ Blue Jay";

  if (hour === 8 && minute <= 30) {
    allowed = true;
    label = "08:00–08:30";
  } else if (hour === 16 && minute <= 59) {
    allowed = true;
    label = "16:00–16:59";
  } else if (hour === 0 && minute <= 59) {
    allowed = true;
    label = "00:00–00:59 (khung 24h)";
  }

  return {
    allowed,
    label,
    timezone: TIMEZONE,
    localDate: `${p.year}-${p.month}-${p.day}`,
    localTime: `${p.hour}:${p.minute}`,
  };
}

export function normalizeMonth(value) {
  if (!value) return value;
  const match = String(value).match(/^(\d{4})-(\d{1,2})/);
  return match ? `${match[1]}-${Number(match[2])}` : value;
}
