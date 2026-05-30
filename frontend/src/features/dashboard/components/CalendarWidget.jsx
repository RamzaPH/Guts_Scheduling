import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { isSameDay, parseDateValue } from "../../../shared/utils/date";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const LOCAL_PH_HOLIDAYS_BY_YEAR = {
  2026: {
    "2026-01-01": "New Year's Day",
    "2026-02-17": "Chinese New Year",
    "2026-04-02": "Maundy Thursday",
    "2026-04-03": "Good Friday",
    "2026-04-04": "Black Saturday",
    "2026-04-09": "Day of Valor",
    "2026-05-01": "Labor Day",
    "2026-06-12": "Independence Day",
    "2026-08-21": "Ninoy Aquino Day",
    "2026-08-31": "National Heroes Day",
    "2026-11-01": "All Saints' Day",
    "2026-11-30": "Bonifacio Day",
    "2026-12-08": "Feast of the Immaculate Conception",
    "2026-12-25": "Christmas Day",
    "2026-12-30": "Rizal Day",
    "2026-12-31": "New Year's Eve",
  },
};

const ENGLISH_HOLIDAY_LABELS = {
  "2026-01-01": "New Year's Day",
  "2026-02-17": "Chinese New Year",
  "2026-04-02": "Maundy Thursday",
  "2026-04-03": "Good Friday",
  "2026-04-04": "Black Saturday",
  "2026-04-09": "Day of Valor",
  "2026-05-01": "Labor Day",
  "2026-06-12": "Independence Day",
  "2026-08-21": "Ninoy Aquino Day",
  "2026-08-31": "National Heroes Day",
  "2026-11-01": "All Saints' Day",
  "2026-11-30": "Bonifacio Day",
  "2026-12-08": "Feast of the Immaculate Conception",
  "2026-12-25": "Christmas Day",
  "2026-12-30": "Rizal Day",
  "2026-12-31": "New Year's Eve",
};

function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  return [...Array(firstDay).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];
}

function isDateAllowedForCourse(date, courseFilter) {
  const normalized = String(courseFilter || "overall").toLowerCase();
  const day = date.getDay();

  if (normalized === "tdc") {
    return day !== 0;
  }

  if (normalized === "pdc" || normalized === "pdc_beginner" || normalized === "pdc_experience") {
    return day >= 1 && day <= 6;
  }

  return true;
}

function isPastDate(date) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date < todayStart;
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getLocalHolidayMap(year) {
  return LOCAL_PH_HOLIDAYS_BY_YEAR[year] || {};
}

function normalizeHolidayResponse(items) {
  const holidayMap = {};
  if (!Array.isArray(items)) {
    return holidayMap;
  }

  for (const item of items) {
    if (!item?.date) continue;
    holidayMap[item.date] = ENGLISH_HOLIDAY_LABELS[item.date] || item.name || item.localName || "Holiday";
  }

  return holidayMap;
}

export default function CalendarWidget({
  view,
  courseFilter = "tdc",
  onPrevMonth,
  onNextMonth,
  reportFilter,
  onSelectDate,
  onOpenSchedule,
  activityDates,
  monthStatus = [],
}) {
  const [remoteHolidayData, setRemoteHolidayData] = useState(null);
  const localHolidayMap = useMemo(() => getLocalHolidayMap(view.year), [view.year]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPhilippineHolidays() {
      try {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${view.year}/PH`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const remoteMap = normalizeHolidayResponse(payload);
        if (Object.keys(remoteMap).length === 0) {
          return;
        }

        setRemoteHolidayData({ year: view.year, map: remoteMap });
      } catch {
        // Fallback to local holiday definitions when API is unavailable.
      }
    }

    void loadPhilippineHolidays();

    return () => {
      controller.abort();
    };
  }, [view.year]);

  const holidayMap =
    remoteHolidayData?.year === view.year && remoteHolidayData?.map
      ? remoteHolidayData.map
      : localHolidayMap;
  const holidaySource = remoteHolidayData?.year === view.year ? "api" : "local";

  const cells = buildCalendar(view.year, view.month);
  const monthStatusMap = new Map(monthStatus.map((item) => [item.date, item]));
  const selectedDate = reportFilter.mode === "day" && reportFilter.date ? parseDateValue(reportFilter.date) : null;
  const rangeStart = reportFilter.startDate ? parseDateValue(reportFilter.startDate) : null;
  const rangeEnd = reportFilter.endDate ? parseDateValue(reportFilter.endDate) : null;

  function isInActiveRange(date) {
    if (reportFilter.mode !== "range" || !rangeStart || !rangeEnd) return false;
    return date >= rangeStart && date <= rangeEnd;
  }

  const monthHolidayEntries = useMemo(() => {
    const viewMonthKey = `${view.year}-${String(view.month + 1).padStart(2, "0")}`;
    return Object.entries(holidayMap)
      .filter(([isoDate]) => isoDate.startsWith(viewMonthKey))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [holidayMap, view.month, view.year]);

  return (
    <div className="rounded-xl border-t-2 border-t-[#D4AF37] border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
            <CalendarDays size={15} className="text-[#D4AF37]" /> Calendar
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Single-click to view the day. Double-click to open the schedule modal.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <button type="button" onClick={onPrevMonth} className="rounded-md border border-slate-300 px-2">
            &lt;
          </button>
          <span>{MONTHS[view.month]} {view.year}</span>
          <button type="button" onClick={onNextMonth} className="rounded-md border border-slate-300 px-2">
            &gt;
          </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {DAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
        {cells.map((day, index) => {
          if (!day) {
            return <span key={`blank-${index}`} className="h-9" />;
          }

          const current = new Date(view.year, view.month, day);
          const holidayLabel = holidayMap[toIsoDate(current)] || null;
          const isHoliday = Boolean(holidayLabel);
          const isEnrollment = activityDates.some((date) => isSameDay(date, current));
          const isSelected = selectedDate ? isSameDay(current, selectedDate) : false;
          const isInRange = isInActiveRange(current);
          const isPast = isPastDate(current);
          const isAllowed = isDateAllowedForCourse(current, courseFilter);
          const isoDate = `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayStatus = monthStatusMap.get(isoDate);
          const isFull = Boolean(dayStatus?.dayFull);

          return (
            <button
              key={`${view.month}-${day}`}
              type="button"
              disabled={!isAllowed}
              onClick={() => {
                if (!isAllowed) return;
                onSelectDate(current);
              }}
              onDoubleClick={() => {
                if (!isAllowed) return;
                onSelectDate(current);
                onOpenSchedule(current);
              }}
              title={holidayLabel ? `${holidayLabel} (${isoDate})` : isoDate}
              className={`relative h-9 rounded-md text-sm font-semibold ${
                !isAllowed
                  ? isHoliday
                    ? "cursor-not-allowed border border-emerald-200 bg-emerald-50 text-emerald-300"
                    : "cursor-not-allowed bg-slate-100 text-slate-300"
                  : isSelected
                  ? "bg-[#800000] text-white"
                  : isInRange
                    ? "cursor-pointer bg-[#D4AF37]/20 text-[#800000] hover:bg-[#D4AF37]/30"
                  : isHoliday
                    ? "cursor-pointer border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : isFull
                    ? "cursor-pointer border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    : isEnrollment
                      ? "cursor-pointer border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                    : "cursor-pointer text-slate-700 hover:bg-slate-100"
              } ${isPast && !isSelected ? "opacity-55" : ""}`}
            >
              {day}
              {isHoliday ? (
                <span className="absolute left-0.5 top-0.5 rounded-full bg-emerald-600 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-white">
                  Hol
                </span>
              ) : null}
              {isFull ? (
                <span className="absolute right-0.5 top-0.5 rounded-full bg-red-600 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-white">
                  Full
                </span>
              ) : null}
              {isEnrollment && !isHoliday ? (
                <span className="absolute bottom-1 left-1/2 h-1.5 w-5 -translate-x-1/2 rounded-full bg-sky-500/70" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <p className="font-semibold uppercase tracking-wide">Philippine Holidays ({view.year})</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-emerald-700/80">
          Source: {holidaySource === "api" ? "Nager public holidays API" : "Local fallback list"}
        </p>
        <p className="mt-1 text-[10px] font-medium text-emerald-700/90">
          Legal holidays are clickable for scheduling.
        </p>
        {monthHolidayEntries.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {monthHolidayEntries.map(([isoDate, label]) => (
              <li key={isoDate}>
                {isoDate}: {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-emerald-700/80">No listed PH holiday for this month.</p>
        )}
      </div>
    </div>
  );
}
