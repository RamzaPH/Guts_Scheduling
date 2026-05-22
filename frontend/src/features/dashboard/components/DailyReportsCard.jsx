import { useState } from "react";

const twoLineClampStyle = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

export default function DailyReportsCard({ rows, total, loading, error, title, subtitle, emptyMessage }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const entryCount = total ?? rows.length;

  return (
    <div className="rounded-xl border-t-2 border-t-[#800000] border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#D4AF37]/20 px-2 py-0.5 text-xs font-semibold text-[#800000]">
            {entryCount} entries
          </span>
          <button
            type="button"
            onClick={() => {
              setIsMinimized(true);
              setIsMaximized(false);
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            title="Minimize report card"
          >
            Minimize
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMinimized(false);
              setIsMaximized((current) => !current);
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            title="Maximize report card"
          >
            {isMaximized ? "Normal" : "Maximize"}
          </button>
        </div>
      </div>

      {isMinimized ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Report card is minimized.
        </div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? <p className="p-4 text-sm text-slate-500">Loading daily reports...</p> : null}
        {error ? <p className="p-4 text-sm text-red-500">Failed to load daily reports.</p> : null}
        {!loading && !error && entryCount === 0 ? (
          <p className="p-4 text-sm text-slate-500">{emptyMessage}</p>
        ) : null}

        {!loading && !error && entryCount > 0 ? (
          <div className="md:hidden space-y-3 px-3 py-3">
            {rows.map((row) => {
              let sessionLabel = row.slotLabel || "-";
              if (!row.slotLabel) {
                if (row.slot === "morning") sessionLabel = "Morning";
                else if (row.slot === "afternoon") sessionLabel = "Afternoon";
                else if (row.slot === "whole_day" || row.sessionType === "whole_day") sessionLabel = "Whole Day";
                else if (row.slot) sessionLabel = row.slot;
              }

              let instructorCareOf = "-";
              if (row.instructor && row.careOf) {
                instructorCareOf = `Instructor: ${row.instructor} | Care of: ${row.careOf}`;
              } else if (row.instructor) {
                instructorCareOf = `Instructor: ${row.instructor}`;
              } else if (row.careOf) {
                instructorCareOf = `Care of: ${row.careOf}`;
              }

              return (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{row.studentName}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.course || row.transactionType || "-"}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {sessionLabel}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600">
                    <div>
                      <p className="font-semibold text-slate-500">Vehicle / Transmission</p>
                      <p className="mt-0.5 break-words text-slate-700">
                        {row.vehicleType || "-"} / {row.transmissionType || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-500">Instructor / Care Of</p>
                      <p className="mt-0.5 break-words text-slate-700">{instructorCareOf}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-500">Instructor Remarks</p>
                      <p className="mt-0.5 break-words text-slate-700">{row.instructorRemarks || "-"}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-500">Student Remarks</p>
                      <p className="mt-0.5 break-words text-slate-700">{row.studentRemarks || row.remarks || row.description || row.transactionType || "-"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {!loading && !error && entryCount > 0 ? (
          <div className={`thin-scrollbar hidden overflow-auto ${isMaximized ? "max-h-[70vh]" : "max-h-[440px]"} md:block`}>
            <table className="min-w-[1100px] divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Student Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Course</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Vehicle Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Type of Transmission</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Session</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Instructor / Care Of</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Instructor Remarks</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Student Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((row) => {
                  let sessionLabel = row.slotLabel || "-";
                  if (!row.slotLabel) {
                    if (row.slot === "morning") sessionLabel = "Morning";
                    else if (row.slot === "afternoon") sessionLabel = "Afternoon";
                    else if (row.slot === "whole_day" || row.sessionType === "whole_day") sessionLabel = "Whole Day";
                    else if (row.slot) sessionLabel = row.slot;
                  }

                  let instructorCareOf = "-";
                  if (row.instructor && row.careOf) {
                    instructorCareOf = `Instructor: ${row.instructor}\nCare of: ${row.careOf}`;
                  } else if (row.instructor) {
                    instructorCareOf = `Instructor: ${row.instructor}`;
                  } else if (row.careOf) {
                    instructorCareOf = `Care of: ${row.careOf}`;
                  }

                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.studentName}</td>
                      <td className="px-4 py-3 text-slate-700">{row.course || row.transactionType || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.vehicleType || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.transmissionType || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{sessionLabel}</td>
                      <td className="px-4 py-3 whitespace-pre-line text-slate-700">{instructorCareOf}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <p style={twoLineClampStyle} className="break-words" title={row.instructorRemarks || "-"}>
                          {row.instructorRemarks || "-"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <p
                          style={twoLineClampStyle}
                          className="break-words"
                          title={row.studentRemarks || row.remarks || row.description || row.transactionType || "-"}
                        >
                          {row.studentRemarks || row.remarks || row.description || row.transactionType || "-"}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
