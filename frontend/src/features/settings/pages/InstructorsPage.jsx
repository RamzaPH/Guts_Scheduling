import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  CalendarPlus,
  ChevronDown,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  UserRound,
  UserRoundCog,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import NotificationBell from "../../notifications/components/NotificationBell";
import { useAuth } from "../../auth/hooks/useAuth";
import { resourceServices } from "../../../services/resources";

const PAGE_SIZE = 8;
const STATUS_OPTIONS = ["Active", "On Leave"];
const QUALIFICATION_OPTIONS = [
  { key: "tdc_certified", label: "TDC Certified (Lecture)" },
  { key: "pdc_beginner_certified", label: "PDC Beginner Certified" },
  { key: "pdc_experience_certified", label: "PDC Experienced Certified" },
];

function specializationFromQualifications(value) {
  const parts = [];
  if (value?.tdc_certified) parts.push("TDC");
  if (value?.pdc_beginner_certified) parts.push("PDC Beginner");
  if (value?.pdc_experience_certified) parts.push("PDC Experience");
  return parts.length ? parts.join(" + ") : "";
}

function normalizeAssignedVehicleIds(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return normalizeAssignedVehicleIds(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }

    return Array.from(
      new Set(
        trimmed
          .split(",")
          .map((id) => Number(id.trim()))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );
  }

  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return [value];
  }

  return [];
}

function emptyForm() {
  return {
    name: "",
    license_number: "",
    specialization: "",
    tdc_certified: false,
    pdc_beginner_certified: false,
    pdc_experience_certified: false,
    status: "Active",
    assigned_vehicle_ids: [],
    phone: "",
    tdc_cert_expiry: "",
    pdc_cert_expiry: "",
    certification_file_name: "",
  };
}

function emptyScheduleForm() {
  return {
    course_id: "",
    vehicle_id: "",
    schedule_date: "",
    slot: "morning",
    remarks: "",
  };
}

export default function InstructorsPage() {
  const navigate = useNavigate();
  const { auth, role, logout } = useAuth();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [courses, setCourses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInstructorId, setEditingInstructorId] = useState(null);
  const [form, setForm] = useState(() => emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingInstructor, setIsDeletingInstructor] = useState(false);

  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState(() => emptyScheduleForm());
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const [isCertificationModalOpen, setIsCertificationModalOpen] = useState(false);
  const [certificationInstructorId, setCertificationInstructorId] = useState("");
  const [certificationForm, setCertificationForm] = useState({
    tdc_cert_expiry: "",
    pdc_cert_expiry: "",
    certification_file_name: "",
  });
  const [isCertificationSaving, setIsCertificationSaving] = useState(false);

  const userMenuRef = useRef(null);

  useEffect(() => {
    function handleOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  async function loadInstructors() {
    setLoading(true);
    setError("");

    try {
      const [instructors, vehicles, courses] = await Promise.all([
        resourceServices.instructors.list(),
        resourceServices.vehicles.list(),
        resourceServices.courses.list(),
      ]);

      const vehiclesById = new Map((vehicles || []).map((vehicle) => [Number(vehicle.id), vehicle]));

      setVehicles(vehicles || []);
      setCourses(courses || []);

      const mapped = (instructors || []).map((item) => ({
        id: item.id,
        name: item.name || `Instructor #${item.id}`,
        licenseNumber: item.license_number || `LIC-${String(item.id).padStart(5, "0")}`,
        tdc_certified: Boolean(item.tdc_certified),
        pdc_beginner_certified: Boolean(item.pdc_beginner_certified),
        pdc_experience_certified: Boolean(item.pdc_experience_certified),
        specialization: specializationFromQualifications(item) || item.specialization || "Unspecified",
        status: item.status || "Active",
        assignedVehicle: (() => {
          const normalizedIds = normalizeAssignedVehicleIds(item.assigned_vehicle_ids);
          const fallbackIds = item.assigned_vehicle_id ? [Number(item.assigned_vehicle_id)] : [];
          const resolvedIds = normalizedIds.length > 0 ? normalizedIds : fallbackIds;

          const names = resolvedIds
            .map((id) => vehiclesById.get(id)?.vehicle_name)
            .filter(Boolean);

          if (names.length > 0) {
            return names.join(", ");
          }

          return item?.assignedVehicle?.vehicle_name || "Unassigned";
        })(),
        assignedVehicleId: item.assigned_vehicle_id || null,
        assignedVehicleIds: (() => {
          const normalizedIds = normalizeAssignedVehicleIds(item.assigned_vehicle_ids);
          if (normalizedIds.length > 0) return normalizedIds;
          return item.assigned_vehicle_id ? [Number(item.assigned_vehicle_id)] : [];
        })(),
        contact: item.phone || "",
        tdc_cert_expiry: item.tdc_cert_expiry || "",
        pdc_cert_expiry: item.pdc_cert_expiry || "",
        certification_file_name: item.certification_file_name || "",
      }));

      setRows(mapped);
    } catch (loadError) {
      setError(loadError?.message || "Failed to load instructors.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      void loadInstructors();
    });
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !keyword ||
        [row.name, row.licenseNumber, row.assignedVehicle, row.contact, row.specialization]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));

      const matchesTab =
        activeTab === "all" ||
        (activeTab === "pdc" && (row.pdc_beginner_certified || row.pdc_experience_certified)) ||
        (activeTab === "tdc" && row.tdc_certified);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && row.status === "Active") ||
        (statusFilter === "inactive" && row.status !== "Active");

      return matchesSearch && matchesTab && matchesStatus;
    });
  }, [rows, search, activeTab, statusFilter]);

  useEffect(() => {
    Promise.resolve().then(() => {
      setPage(1);
    });
  }, [search, activeTab, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(startIndex, startIndex + PAGE_SIZE);
  const assignVehicleOptions = useMemo(() => {
    const selectedIds = (selectedInstructor?.assignedVehicleIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (selectedIds.length === 0) {
      return vehicles;
    }

    const allowed = new Set(selectedIds);
    const filteredVehicles = vehicles.filter((vehicle) => allowed.has(Number(vehicle.id)));

    // Fallback to all vehicles if assigned IDs are stale or missing from current fleet list.
    return filteredVehicles.length > 0 ? filteredVehicles : vehicles;
  }, [selectedInstructor, vehicles]);

  function printInstructors() {
    window.print();
  }


  function openAddModal() {
    setEditingInstructorId(null);
    setForm(emptyForm());
    setIsModalOpen(true);
  }

  function openEditModal(row) {
    setEditingInstructorId(row.id);
    setForm({
      name: row.name,
      license_number: row.licenseNumber,
      specialization: row.specialization,
      tdc_certified: Boolean(row.tdc_certified),
      pdc_beginner_certified: Boolean(row.pdc_beginner_certified),
      pdc_experience_certified: Boolean(row.pdc_experience_certified),
      status: row.status,
      assigned_vehicle_ids: (row.assignedVehicleIds || []).map((id) => String(id)),
      phone: row.contact || "",
      tdc_cert_expiry: row.tdc_cert_expiry || "",
      pdc_cert_expiry: row.pdc_cert_expiry || "",
      certification_file_name: row.certification_file_name || "",
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setEditingInstructorId(null);
    setForm(emptyForm());
  }

  async function submitInstructor(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.license_number.trim()) {
      window.alert("Name and license number are required.");
      return;
    }

    if (!form.tdc_certified && !form.pdc_beginner_certified && !form.pdc_experience_certified) {
      window.alert("Select at least one instructor qualification.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        assigned_vehicle_ids: (form.assigned_vehicle_ids || [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
        name: form.name.trim(),
        license_number: form.license_number.trim(),
        specialization: specializationFromQualifications(form),
        tdc_certified: Boolean(form.tdc_certified),
        pdc_beginner_certified: Boolean(form.pdc_beginner_certified),
        pdc_experience_certified: Boolean(form.pdc_experience_certified),
        status: form.status,
        assigned_vehicle_id: (form.assigned_vehicle_ids || []).length > 0 ? Number(form.assigned_vehicle_ids[0]) : null,
        phone: form.phone.trim(),
        tdc_cert_expiry: form.tdc_cert_expiry || null,
        pdc_cert_expiry: form.pdc_cert_expiry || null,
        certification_file_name: form.certification_file_name || null,
      };

      if (editingInstructorId) {
        await resourceServices.instructors.update(editingInstructorId, payload);
      } else {
        await resourceServices.instructors.create(payload);
      }

      closeModal();
      await loadInstructors();
    } catch (submitError) {
      window.alert(submitError?.message || "Failed to save instructor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openProfileModal(row) {
    setSelectedInstructor(row);
    setAssignForm({
      ...emptyScheduleForm(),
      vehicle_id: row.assignedVehicleIds?.[0] ? String(row.assignedVehicleIds[0]) : "",
    });
    setIsAssignOpen(false);
    setIsProfileModalOpen(true);
  }

  function closeProfileModal() {
    if (assignSubmitting) return;
    setIsProfileModalOpen(false);
    setSelectedInstructor(null);
    setIsAssignOpen(false);
  }

  async function submitAssignSchedule(event) {
    event.preventDefault();
    if (!selectedInstructor) return;

    if (!assignForm.course_id || !assignForm.vehicle_id || !assignForm.schedule_date) {
      window.alert("Please complete course, vehicle, and date.");
      return;
    }

    setAssignSubmitting(true);
    try {
      await resourceServices.schedules.create({
        course_id: Number(assignForm.course_id),
        instructor_id: Number(selectedInstructor.id),
        vehicle_id: Number(assignForm.vehicle_id),
        schedule_date: assignForm.schedule_date,
        slot: assignForm.slot,
        remarks: assignForm.remarks,
      });

      setIsAssignOpen(false);
      window.alert("Instructor assigned to schedule successfully.");
    } catch (assignError) {
      window.alert(assignError?.message || "Failed to assign instructor to schedule.");
    } finally {
      setAssignSubmitting(false);
    }
  }

  function onCertificationInstructorChange(value) {
    setCertificationInstructorId(value);
    const selected = rows.find((row) => String(row.id) === value);
    setCertificationForm({
      tdc_cert_expiry: selected?.tdc_cert_expiry || "",
      pdc_cert_expiry: selected?.pdc_cert_expiry || "",
      certification_file_name: selected?.certification_file_name || "",
    });
  }

  async function submitCertification(event) {
    event.preventDefault();
    if (!certificationInstructorId) return;

    setIsCertificationSaving(true);
    try {
      await resourceServices.instructors.update(Number(certificationInstructorId), {
        tdc_cert_expiry: certificationForm.tdc_cert_expiry || null,
        pdc_cert_expiry: certificationForm.pdc_cert_expiry || null,
        certification_file_name: certificationForm.certification_file_name || null,
      });
      setIsCertificationModalOpen(false);
      await loadInstructors();
    } catch (saveError) {
      window.alert(saveError?.message || "Failed to update certifications.");
    } finally {
      setIsCertificationSaving(false);
    }
  }

  async function toggleArchive(row) {
    const nextStatus = row.status === "Active" ? "On Leave" : "Active";

    try {
      await resourceServices.instructors.update(row.id, { status: nextStatus });
      await loadInstructors();
    } catch (archiveError) {
      window.alert(archiveError?.message || "Failed to update instructor status.");
    }
  }

  async function updateStatusFromProfile() {
    if (!selectedInstructor) return;

    const nextStatus = selectedInstructor.status === "Active" ? "On Leave" : "Active";
    await toggleArchive(selectedInstructor);
    setSelectedInstructor((current) => (current ? { ...current, status: nextStatus } : current));
  }

  async function removeInstructorFromProfile() {
    if (!selectedInstructor || isDeletingInstructor) return;

    const shouldDelete = window.confirm(
      `Remove instructor ${selectedInstructor.name}? This cannot be undone.`
    );

    if (!shouldDelete) return;

    setIsDeletingInstructor(true);
    try {
      await resourceServices.instructors.remove(selectedInstructor.id);
      closeProfileModal();
      await loadInstructors();
      window.alert("Instructor removed successfully.");
    } catch (deleteError) {
      window.alert(deleteError?.message || "Failed to remove instructor.");
    } finally {
      setIsDeletingInstructor(false);
    }
  }

  return (
    <>
      <section className="no-print space-y-4">
      <div className="rounded-xl border-t-2 border-t-[#D4AF37] border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-lg bg-[#800000] px-4 py-2 text-xs font-semibold text-white"
          >
            <Plus size={14} />
            Add Instructor
          </button>

          <label className="ml-auto flex min-w-52 flex-1 items-center gap-2 rounded-full bg-[#800000] px-3 py-2 transition hover:bg-[#600000]">
            <Search size={14} className="text-[#D4AF37]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search instructors..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/70"
            />
          </label>

          {(role === "admin" || role === "sub_admin") ? (
            <NotificationBell
              buttonClassName="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D4AF37]/70 bg-[#800000] text-[#D4AF37] transition hover:bg-[#600000]"
              iconSize={14}
              dropdownClassName="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            />
          ) : null}

          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((value) => !value)}
              className="inline-flex items-center gap-1 rounded-full border border-[#D4AF37]/70 bg-[#800000] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#600000]"
            >
              <UserRound size={13} className="text-[#D4AF37]" />
              {auth?.user?.name || "System Admin"}
              <ChevronDown size={12} className={`text-[#D4AF37] transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {userMenuOpen ? (
              <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                {role === "admin" ? (
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/settings/users");
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <UserRoundCog size={14} />
                    Manage Users
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-xl border-t-2 border-t-[#D4AF37] border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Instructors Management</h1>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  activeTab === "all" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                All Instructors
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("pdc")}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  activeTab === "pdc" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                PDC Certified
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tdc")}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  activeTab === "tdc" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                TDC Certified
              </button>

              <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-[#800000]"
                >
                  <option value="all">Status: All</option>
                  <option value="active">Status: Active</option>
                  <option value="inactive">Status: Inactive</option>
                </select>

                <button
                  type="button"
                  onClick={printInstructors}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#800000]/20 bg-[#800000] px-3 py-2 text-xs font-semibold text-white hover:bg-[#670000]"
                >
                  <Printer size={13} />
                  Print
                </button>
              </div>
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            <div className="mt-4 space-y-3 md:hidden">
              {!loading && pagedRows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No instructors found.
                </div>
              ) : null}

              {!loading
                ? pagedRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => openProfileModal(row)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#800000]">{row.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{row.licenseNumber}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                            row.status === "Active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </div>

                      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600">
                        <div>
                          <dt className="font-semibold text-slate-500">Specialization</dt>
                          <dd className="mt-0.5 text-slate-700">{row.specialization}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-500">Assigned Vehicles</dt>
                          <dd className="mt-0.5 text-slate-700">{row.assignedVehicle}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-500">Contact Number</dt>
                          <dd className="mt-0.5 text-slate-700">{row.contact || "-"}</dd>
                        </div>
                      </dl>
                    </button>
                  ))
                : null}
            </div>

            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
              <table className="min-w-[900px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Instructor Name</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">ID / License Number</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Specialization</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Assigned Vehicles</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Contact Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading instructors...</td>
                    </tr>
                  ) : null}

                  {!loading && pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No instructors found.</td>
                    </tr>
                  ) : null}

                  {!loading
                    ? pagedRows.map((row) => (
                        <tr key={row.id} className="cursor-pointer hover:bg-[#D4AF37]/10" onClick={() => openProfileModal(row)}>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openProfileModal(row);
                              }}
                              className="font-semibold text-[#800000] hover:underline"
                            >
                              {row.name}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{row.licenseNumber}</td>
                          <td className="px-4 py-3 text-slate-700">{row.specialization}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                row.status === "Active"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{row.assignedVehicle}</td>
                          <td className="px-4 py-3 text-slate-700">{row.contact || "-"}</td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 disabled:opacity-50"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setPage(num)}
                  className={`h-7 min-w-7 rounded-md px-2 text-xs font-semibold ${
                    num === safePage ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>
        </div>

        <aside className="rounded-xl border-t-2 border-t-[#D4AF37] border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Quick Actions</p>
          <p className="mt-1 text-xs text-slate-500">Instructor operations shortcuts</p>

          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-full rounded-lg bg-[#800000] px-3 py-2 text-left text-xs font-semibold text-white"
            >
              Schedule New Class
            </button>
          </div>
        </aside>
      </div>

      {isModalOpen ? (
        <div
          style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
          className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingInstructorId ? "Edit Instructor" : "Add Instructor"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <form className="mt-4 space-y-3" onSubmit={submitInstructor}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  Instructor Name
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                    placeholder="Full name"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  License Number
                  <input
                    value={form.license_number}
                    onChange={(event) => setForm((current) => ({ ...current, license_number: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                    placeholder="LIC-00001"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <fieldset className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  <legend className="text-xs font-semibold text-slate-600">Qualifications</legend>
                  <div className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">
                    <div className="space-y-2">
                      {QUALIFICATION_OPTIONS.map((option) => (
                        <label key={option.key} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={Boolean(form[option.key])}
                            onChange={(event) => setForm((current) => ({
                              ...current,
                              [option.key]: event.target.checked,
                            }))}
                            className="h-4 w-4 rounded border-slate-300 text-[#800000] focus:ring-[#800000]"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </fieldset>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                    required
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <fieldset className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  <legend className="text-xs font-semibold text-slate-600">Assigned Vehicles</legend>
                  <div className="max-h-44 overflow-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">
                    {vehicles.length === 0 ? (
                      <p className="text-xs text-slate-500">No vehicles available.</p>
                    ) : (
                      <div className="space-y-2">
                        {vehicles.map((vehicle) => {
                          const vehicleId = String(vehicle.id);
                          const isChecked = (form.assigned_vehicle_ids || []).includes(vehicleId);

                          return (
                            <label key={vehicle.id} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(event) => {
                                  setForm((current) => {
                                    const currentIds = Array.isArray(current.assigned_vehicle_ids)
                                      ? current.assigned_vehicle_ids
                                      : [];

                                    if (event.target.checked) {
                                      return {
                                        ...current,
                                        assigned_vehicle_ids: Array.from(new Set([...currentIds, vehicleId])),
                                      };
                                    }

                                    return {
                                      ...current,
                                      assigned_vehicle_ids: currentIds.filter((id) => id !== vehicleId),
                                    };
                                  });
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-[#800000] focus:ring-[#800000]"
                              />
                              {vehicle.vehicle_name} ({vehicle.plate_number || "No Plate"})
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </fieldset>

                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  Contact Number
                  <input
                    value={form.phone}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                    placeholder="09XXXXXXXXX"
                  />
                </label>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-[#800000] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : editingInstructorId ? "Save Changes" : "Create Instructor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isProfileModalOpen && selectedInstructor ? (
        <div
          style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
          className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Instructor Profile</h2>
              <button
                type="button"
                onClick={closeProfileModal}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <p><span className="font-semibold text-slate-900">Name:</span> {selectedInstructor.name}</p>
              <p><span className="font-semibold text-slate-900">License Number:</span> {selectedInstructor.licenseNumber}</p>
              <p><span className="font-semibold text-slate-900">Specialization:</span> {selectedInstructor.specialization}</p>
              <p><span className="font-semibold text-slate-900">Contact Number:</span> {selectedInstructor.contact || "-"}</p>
              <p><span className="font-semibold text-slate-900">Status:</span> {selectedInstructor.status}</p>
              <p><span className="font-semibold text-slate-900">Assigned Vehicles:</span> {selectedInstructor.assignedVehicle}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  closeProfileModal();
                  openEditModal(selectedInstructor);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <Pencil size={13} />
                Edit / Update
              </button>
              <button
                type="button"
                onClick={updateStatusFromProfile}
                className="inline-flex items-center gap-2 rounded-md border border-[#800000]/20 bg-[#800000]/5 px-3 py-2 text-xs font-semibold text-[#800000]"
              >
                {selectedInstructor.status === "Active" ? "Set On Leave" : "Set Active"}
              </button>
              <button
                type="button"
                onClick={() => setIsAssignOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-md bg-[#800000] px-3 py-2 text-xs font-semibold text-white"
              >
                <CalendarPlus size={13} />
                Assign to Schedule
              </button>
              <button
                type="button"
                onClick={removeInstructorFromProfile}
                disabled={isDeletingInstructor}
                className="inline-flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
              >
                <Trash2 size={13} />
                {isDeletingInstructor ? "Removing..." : "Remove Instructor"}
              </button>
            </div>

            {isAssignOpen ? (
              <form onSubmit={submitAssignSchedule} className="mt-4 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-bold tracking-wide text-slate-700">Schedule Assignment</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Date
                    <input
                      type="date"
                      value={assignForm.schedule_date}
                      onChange={(event) => setAssignForm((current) => ({ ...current, schedule_date: event.target.value }))}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Time Slot
                    <select
                      value={assignForm.slot}
                      onChange={(event) => setAssignForm((current) => ({ ...current, slot: event.target.value }))}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                      required
                    >
                      <option value="morning">8:00 AM - 12:00 PM</option>
                      <option value="afternoon">1:00 PM - 5:00 PM</option>
                    </select>
                  </label>
                </div>

                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Course
                    <select
                      value={assignForm.course_id}
                      onChange={(event) => setAssignForm((current) => ({ ...current, course_id: event.target.value }))}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                      required
                    >
                      <option value="">Select course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={String(course.id)}>{course.course_name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Vehicle
                    <select
                      value={assignForm.vehicle_id}
                      onChange={(event) => setAssignForm((current) => ({ ...current, vehicle_id: event.target.value }))}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                      required
                    >
                      <option value="">Select vehicle</option>
                      {assignVehicleOptions.map((vehicle) => (
                        <option key={vehicle.id} value={String(vehicle.id)}>
                          {vehicle.vehicle_name} ({vehicle.plate_number || "No Plate"})
                        </option>
                      ))}
                    </select>
                    {selectedInstructor.assignedVehicleIds?.length > 0 ? (
                      <span className="text-[11px] text-slate-500">Showing assigned vehicles for this instructor.</span>
                    ) : (
                      <span className="text-[11px] text-slate-500">No assigned vehicles yet; showing all vehicles.</span>
                    )}
                  </label>
                </div>

                <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  Remarks
                  <input
                    value={assignForm.remarks}
                    onChange={(event) => setAssignForm((current) => ({ ...current, remarks: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                    placeholder="Optional note"
                  />
                </label>

                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={assignSubmitting}
                    className="rounded-md bg-[#800000] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {assignSubmitting ? "Assigning..." : "Confirm Assignment"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {isCertificationModalOpen ? (
        <div
          style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
          className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Manage Certifications</h2>
              <button
                type="button"
                onClick={() => setIsCertificationModalOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <form className="mt-4 space-y-3" onSubmit={submitCertification}>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Instructor
                <select
                  value={certificationInstructorId}
                  onChange={(event) => onCertificationInstructorChange(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                  required
                >
                  {rows.map((row) => (
                    <option key={row.id} value={String(row.id)}>{row.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  TDC Certification Expiry
                  <input
                    type="date"
                    value={certificationForm.tdc_cert_expiry}
                    onChange={(event) =>
                      setCertificationForm((current) => ({ ...current, tdc_cert_expiry: event.target.value }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  PDC Certification Expiry
                  <input
                    type="date"
                    value={certificationForm.pdc_cert_expiry}
                    onChange={(event) =>
                      setCertificationForm((current) => ({ ...current, pdc_cert_expiry: event.target.value }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#800000]"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Upload Certification File
                <input
                  type="file"
                  onChange={(event) => {
                    const fileName = event.target.files?.[0]?.name || "";
                    setCertificationForm((current) => ({ ...current, certification_file_name: fileName }));
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none file:mr-3 file:rounded file:border-0 file:bg-[#800000]/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#800000]"
                />
                {certificationForm.certification_file_name ? (
                  <span className="text-[11px] text-slate-500">Selected: {certificationForm.certification_file_name}</span>
                ) : null}
              </label>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCertificationModalOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCertificationSaving}
                  className="rounded-md bg-[#800000] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {isCertificationSaving ? "Saving..." : "Save Certification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      </section>
    </>
  );
}
