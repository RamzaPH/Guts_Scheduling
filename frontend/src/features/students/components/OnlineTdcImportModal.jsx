import { useState } from "react";
import { Upload, X } from "lucide-react";
import { importOnlineTdcStudents } from "../services/studentsApi";
import { useToast } from "../../../shared/utils/toast";

/**
 * OnlineTdcImportModal - Upload students from external TDC sources
 * 
 * Supported sources:
 * - SafeRoads.ph: Rich export format (50+ fields), recommended for GUTS
 * - OTDC.ph: Minimal export format (6 fields), supports third-party payment
 * 
 * File formats: CSV or Excel (.xlsx, .xls)
 * Max file size: 20MB
 * 
 * Required columns vary by source:
 * - SafeRoads: firstName, lastName, email, mobile (auto-detected from camelCase or snake_case)
 * - OTDC student-page export: Email, Name, Payment Mode, Registration Date, Completed Date & Time, Driving School
 * - OTDC payment-page export: Registration Date, Student, Amount, Driving School, City, Region
 *
 * Special case:
 * - Imported SafeRoads/OTDC records use their source start/completion dates to decide if the row is pending or completed
 * - Completed imports are treated as TDC with a fixed 999 PHP payment record
 * - Completed imports are treated as TDC with a fixed 599 PHP payment record
 */
export default function OnlineTdcImportModal({
  isOpen,
  onClose,
  file,
  onFileChange,
  source,
  onSourceChange,
  onImportSuccess,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [, addToast] = useToast();

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileChange(selectedFile);
    }
  };

  const handleClearFile = () => {
    onFileChange(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      addToast("Please select a file to upload.", "warning");
      return;
    }

    if (!source) {
      addToast("Please select an import source.", "warning");
      return;
    }

    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("source", source);

      const result = await importOnlineTdcStudents(formData);

      // Build success message
      const parts = [
        `${result.imported} student${result.imported !== 1 ? "s" : ""} imported`,
        `${result.updated} updated`,
        `${result.skipped} skipped`,
      ];
      const summary = parts.join(", ");
      addToast(`Upload complete: ${summary}`, "success");

      // Call success callback to close modal and refresh list
      onImportSuccess();
    } catch (error) {
      addToast(error?.message || "Failed to upload students.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Upload Students</h2>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Source Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Import Source *
            </label>
            <select
              value={source}
              onChange={(e) => onSourceChange(e.target.value)}
              disabled={isUploading}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="">Select a source...</option>
              <option value="saferoads">SafeRoads.ph</option>
              <option value="otdc">OTDC.ph</option>
              <option value="odep">Saferoads (ODEP)</option>
            </select>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              CSV or Excel File *
            </label>
            {file ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm text-slate-900 font-medium">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearFile}
                  disabled={isUploading}
                  className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 cursor-pointer transition hover:border-blue-400 hover:bg-blue-50">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  className="hidden"
                />
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-700">
                    Click to select or drag and drop
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    CSV or Excel (max 20 MB)
                  </p>
                </div>
              </label>
            )}
          </div>

          {/* Info Text */}
          <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            {source === "saferoads" || source === "odep" ? (
              <>
                <p className="text-xs text-blue-900">
                  <strong>SafeRoads.ph Export:</strong> firstName, lastName, email, mobile (required)
                </p>
                <p className="text-xs text-blue-900 mt-1">
                  Optional: middleName, gender, birthDate, courseCode, courseName, quizStartDate, quizEndDate, examStartDate, examEndDate, certified, etc.
                </p>
              </>
            ) : source === "otdc" ? (
              <>
                <p className="text-xs text-blue-900">
                  <strong>OTDC.ph Student Export:</strong> Email, Name, Payment Mode, Registration Date, Completed Date & Time, Driving School
                </p>
                <p className="text-xs text-blue-900 mt-1">
                  <strong>OTDC.ph Payment Export:</strong> Registration Date, Student, Amount, Driving School, City, Region
                </p>
                <p className="text-xs text-blue-900 mt-1">
                  Registration Date is used as the start date; Completed Date & Time decides whether the imported row is marked completed.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-blue-900">
                  <strong>SafeRoads.ph:</strong> firstName, lastName, email, mobile
                </p>
                <p className="text-xs text-blue-900 mt-1">
                  <strong>OTDC.ph:</strong> Email, Name
                </p>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !file || !source}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? (
                <span className="flex items-center justify-center">
                  <span className="inline-block mr-2 h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Uploading...
                </span>
              ) : (
                "Upload Students"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
