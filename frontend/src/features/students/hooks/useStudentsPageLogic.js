import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../../shared/utils/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStudentsList } from "./useStudentsList";
import { deleteStudent, updateEnrollmentStatus, updateStudent } from "../services/studentsApi";
import { getCourseCode, getEnrollmentLifecycleStatus, getEnrollmentPaymentSummary, getLatestEnrollment, mapStudentToEditForm } from "../utils/studentsPageUtils";
import {
  formatPromoScoreValue,
  formatScoreValue,
  mapOutcomeToEnrollmentStatus,
  parseScoreValue,
} from "../utils/statusUpdateConfig";
import { hasPromoStatusContext } from "../utils/studentsPageUtils";

const PAGE_SIZE = 10;
const STATUS_RANK = {
  pending: 1,
  confirmed: 2,
  completed: 3,
  cancelled: 4,
};

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameSearchTargets(student) {
  const first = normalizeSearchText(student?.first_name);
  const middle = normalizeSearchText(student?.middle_name);
  const last = normalizeSearchText(student?.last_name);

  const parts = [first, middle, last].filter(Boolean);
  const fullWithMiddle = [first, middle, last].filter(Boolean).join(" ");
  const fullNoMiddle = [first, last].filter(Boolean).join(" ");
  const middleLast = [middle, last].filter(Boolean).join(" ");

  return [
    ...parts,
    fullWithMiddle,
    fullNoMiddle,
    middleLast,
  ].filter(Boolean);
}

function matchesStudentSearch(student, rawQuery) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return true;

  const tokens = query.split(" ").filter(Boolean);
  const nameTargets = buildNameSearchTargets(student);
  const emailTarget = normalizeSearchText(student?.email);
  const phoneTarget = normalizeSearchText(student?.phone);

  const tokenMatch = tokens.every((token) => {
    return nameTargets.some((target) => target.includes(token));
  });

  if (tokenMatch) return true;

  return [emailTarget, phoneTarget]
    .filter(Boolean)
    .some((target) => target.includes(query));
}

function getCourseMembership(student) {
  const enrollment = getLatestEnrollment(student);
  const code = String(enrollment?.DLCode?.code || "").toUpperCase();
  const enrollmentType = String(enrollment?.enrollment_type || "").toUpperCase();
  const pdcType = String(enrollment?.pdc_type || enrollment?.pdc_category || "").toLowerCase();

  const membership = {
    tdc: false,
    pdcBeginner: false,
    pdcExperience: false,
  };

  const isPromo =
    code.includes("PROMO") ||
    enrollmentType === "PROMO" ||
    (code.includes("TDC") && code.includes("PDC"));

  if (code.includes("TDC") || enrollmentType === "TDC" || isPromo) {
    membership.tdc = true;
  }

  if (code.includes("PDC") || enrollmentType === "PDC" || isPromo) {
    if (pdcType.includes("experience")) {
      membership.pdcExperience = true;
    } else {
      membership.pdcBeginner = true;
    }
  }

  return membership;
}

function isPassedOutcome(value) {
  return String(value || "").trim().toUpperCase() === "PASSED";
}

function getCompletionFlags(student) {
  const latestEnrollment = getLatestEnrollment(student);
  const courseCode = getCourseCode(student);
  const enrollmentStatus = String(latestEnrollment?.status || "").toLowerCase();
  const parsed = parseScoreValue(latestEnrollment?.score);

  const isPromo = courseCode === "PROMO";
  const promoTdcPassed = isPassedOutcome(parsed.promoTdcOutcome);
  const promoPdcPassed = isPassedOutcome(parsed.promoPdcOutcome);
  const promoFullyPassed = isPromo && promoTdcPassed && promoPdcPassed;

  if (isPromo) {
    return {
      isPassed: promoFullyPassed,
      isCompletedOrPassed: promoFullyPassed,
    };
  }

  const nonPromoPassed = isPassedOutcome(parsed.outcome);
  const nonPromoCompleted = enrollmentStatus === "completed";

  return {
    isPassed: nonPromoPassed,
    isCompletedOrPassed: nonPromoPassed || nonPromoCompleted,
  };
}

function matchesCourseFilter(student, filter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "passed") {
    return getCompletionFlags(student).isCompletedOrPassed;
  }

  const membership = getCourseMembership(student);
  if (filter === "TDC") {
    return membership.tdc;
  }

  if (filter === "PDC") {
    return membership.pdcBeginner || membership.pdcExperience;
  }

  return getCourseCode(student) === filter;
}

export function useStudentsPageLogic(options = {}) {
  const focusedStudentId = options.focusedStudentId ? Number(options.focusedStudentId) : null;
  const view = String(options.view || "overall").toLowerCase();
  let includeExternal = options.includeExternal ?? false;
  let source = options.source || null;

  if (view === "overall") {
    includeExternal = true;
    source = null;
  } else if (view === "qr") {
    includeExternal = false;
    source = null;
  } else if (view === "otdc") {
    includeExternal = true;
    source = "otdc";
  } else if (view === "saferoads") {
    includeExternal = true;
    source = "saferoads";
  } else if (view === "odep") {
    includeExternal = true;
    source = "saferoads";
  }
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");
  const [page, setPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState(() => mapStudentToEditForm(null));
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [updatingStatusStudent, setUpdatingStatusStudent] = useState(null);
  const [statusForm, setStatusForm] = useState({
    enrollmentStatus: "",
    courseOutcome: "",
    promoCategory: "TDC",
    promoTdcOutcome: "",
    promoPdcOutcome: "",
  });
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [bulkStatusForm, setBulkStatusForm] = useState({
    tdcOutcome: "",
    pdcOutcome: "",
    promoTdcOutcome: "",
    promoPdcOutcome: "",
  });
  const [toasts, addToast, removeToast] = useToast();

  const { data, isLoading, isError, error } = useStudentsList({ includeExternal, source });
  const students = useMemo(() => data || [], [data]);



  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateStudent(id, payload),
    onSuccess: async () => {
      addToast("Student updated successfully.", "success");
      setEditingStudent(null);
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (mutationError) => {
      addToast(mutationError?.message || "Failed to update student.", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteStudent(id),
    onSuccess: async () => {
      addToast("Student deleted successfully.", "success");
      setDeletingStudent(null);
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (mutationError) => {
      addToast(mutationError?.message || "Failed to delete student.", "error");
    },
  });

  const statusUpdateMutation = useMutation({
    mutationFn: ({ id, enrollmentStatus, courseOutcome, promoCategory, score }) =>
      updateEnrollmentStatus(id, { enrollmentStatus, courseOutcome, promoCategory, score }),
    onSuccess: async (updatedStudent) => {
      queryClient.setQueryData(["students"], (current) => {
        if (!Array.isArray(current)) return current;
        return current.map((student) =>
          Number(student.id) === Number(updatedStudent?.id) ? updatedStudent : student
        );
      });

      addToast("Status updated successfully.", "success");
      setUpdatingStatusStudent(null);
      setStatusForm({
        enrollmentStatus: "",
        courseOutcome: "",
        promoCategory: "TDC",
        promoTdcOutcome: "",
        promoPdcOutcome: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (mutationError) => {
      addToast(mutationError?.message || "Failed to update status.", "error");
    },
  });

  const bulkStatusUpdateMutation = useMutation({
    mutationFn: async ({ updates }) => {
      const results = await Promise.allSettled(
        updates.map((item) => updateEnrollmentStatus(item.id, item.payload))
      );

      const failed = results
        .map((result, index) => ({ result, id: updates[index]?.id }))
        .filter((item) => item.result.status === "rejected");

      return {
        total: updates.length,
        failed,
      };
    },
    onSuccess: async ({ total, failed }) => {
      if (failed.length === 0) {
        addToast(`Updated status for ${total} student${total === 1 ? "" : "s"}.`, "success");
      } else {
        const successCount = total - failed.length;
        addToast(
          `Updated ${successCount} student${successCount === 1 ? "" : "s"}; ${failed.length} failed.`,
          "error"
        );
      }

      setIsBulkStatusModalOpen(false);
      setBulkStatusForm({
        tdcOutcome: "",
        pdcOutcome: "",
        promoTdcOutcome: "",
        promoPdcOutcome: "",
      });
      setSelectedStudentIds([]);
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (mutationError) => {
      addToast(mutationError?.message || "Failed to update selected students.", "error");
    },
  });

  // Compute summary based on current filter
  const summary = useMemo(() => {
    const filtered = students.filter((student) => matchesCourseFilter(student, courseFilter));

    const currentlyEnrolled = filtered.filter((student) => {
      const latestEnrollment = getLatestEnrollment(student);
      const status = getEnrollmentLifecycleStatus(latestEnrollment, student);
      return status === "pending" || status === "confirmed";
    }).length;

    const tdc = filtered.filter((student) => getCourseMembership(student).tdc).length;
    const pdcBeginner = filtered.filter((student) => getCourseMembership(student).pdcBeginner).length;
    const pdcExperience = filtered.filter((student) => getCourseMembership(student).pdcExperience).length;
    const paymentPending = filtered.filter((student) => getEnrollmentPaymentSummary(getLatestEnrollment(student), student).paymentStatus !== "completed_payment").length;
    const paymentCompleted = filtered.filter((student) => getEnrollmentPaymentSummary(getLatestEnrollment(student), student).paymentStatus === "completed_payment").length;

    return {
      total: filtered.length,
      currentlyEnrolled,
      tdc,
      pdc: pdcBeginner + pdcExperience,
      completed: filtered.filter((student) => getEnrollmentLifecycleStatus(getLatestEnrollment(student), student) === "completed").length,
      paymentPending,
      paymentCompleted,
      thisMonth: filtered.filter((student) => {
        const enrollment = getLatestEnrollment(student);
        const createdAt = enrollment?.createdAt || enrollment?.created_at;
        if (!createdAt) return false;
        const now = new Date();
        const created = new Date(createdAt);
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      }).length,
      pdc_b: pdcBeginner,
      pdc_e: pdcExperience,
    };
  }, [students, courseFilter]);

  const filteredStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      const matchesSearch = matchesStudentSearch(student, search);

      const matchesCourse = matchesCourseFilter(student, courseFilter);
      const latestEnrollment = getLatestEnrollment(student);
      const enrollmentStatus = getEnrollmentLifecycleStatus(latestEnrollment, student);
      const matchesStatus = statusFilter === "all" || enrollmentStatus === statusFilter;
      const paymentStatus = getEnrollmentPaymentSummary(latestEnrollment, student).paymentStatus;
      const matchesPayment =
        paymentFilter === "all"
        || (paymentFilter === "with_balance" && paymentStatus !== "completed_payment" && paymentStatus !== "not_set")
        || (paymentFilter === "completed_payment" && paymentStatus === "completed_payment");
      const matchesFocusedStudent = !focusedStudentId || Number(student.id) === focusedStudentId;

      return matchesSearch && matchesCourse && matchesStatus && matchesPayment && matchesFocusedStudent;
    });

    const sorted = [...filtered].sort((a, b) => {
      const nameA = [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(" ").trim().toLowerCase();
      const nameB = [b.first_name, b.middle_name, b.last_name].filter(Boolean).join(" ").trim().toLowerCase();
      const contactA = `${String(a.email || "").toLowerCase()} ${String(a.phone || "").toLowerCase()}`.trim();
      const contactB = `${String(b.email || "").toLowerCase()} ${String(b.phone || "").toLowerCase()}`.trim();
      const courseA = String(getCourseCode(a) || "").toLowerCase();
      const courseB = String(getCourseCode(b) || "").toLowerCase();
      const statusA = getEnrollmentLifecycleStatus(getLatestEnrollment(a), a);
      const statusB = getEnrollmentLifecycleStatus(getLatestEnrollment(b), b);

      if (sortBy === "name_asc") {
        return nameA.localeCompare(nameB);
      }

      if (sortBy === "name_desc") {
        return nameB.localeCompare(nameA);
      }

      if (sortBy === "id_desc") {
        return Number(b.id) - Number(a.id);
      }

      if (sortBy === "id_asc") {
        return Number(a.id) - Number(b.id);
      }

      if (sortBy === "contact_asc") {
        return contactA.localeCompare(contactB);
      }

      if (sortBy === "contact_desc") {
        return contactB.localeCompare(contactA);
      }

      if (sortBy === "course_asc") {
        return courseA.localeCompare(courseB);
      }

      if (sortBy === "course_desc") {
        return courseB.localeCompare(courseA);
      }

      if (sortBy === "status" || sortBy === "status_asc") {
        const rankA = STATUS_RANK[statusA] || 99;
        const rankB = STATUS_RANK[statusB] || 99;
        if (rankA !== rankB) {
          return rankA - rankB;
        }

        return nameA.localeCompare(nameB);
      }

      if (sortBy === "status_desc") {
        const rankA = STATUS_RANK[statusA] || 99;
        const rankB = STATUS_RANK[statusB] || 99;
        if (rankA !== rankB) {
          return rankB - rankA;
        }

        return nameA.localeCompare(nameB);
      }

      return nameA.localeCompare(nameB);
    });

    return sorted;
  }, [students, search, courseFilter, paymentFilter, statusFilter, sortBy, focusedStudentId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [focusedStudentId]);

  const totalEntries = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedStudents = filteredStudents.slice(startIndex, startIndex + PAGE_SIZE);

  const pagination = {
    fromEntry: totalEntries ? startIndex + 1 : 0,
    toEntry: totalEntries ? Math.min(startIndex + PAGE_SIZE, totalEntries) : 0,
    totalEntries,
    currentPage,
    totalPages,
  };

  const pagedStudentIds = pagedStudents.map((student) => student.id);
  const allVisibleSelected = pagedStudentIds.length > 0 && pagedStudentIds.every((id) => selectedStudentIds.includes(id));

  const selectedStudentsForBulk = useMemo(
    () => students.filter((student) => selectedStudentIds.includes(student.id)),
    [students, selectedStudentIds]
  );

  const bulkSelectionMeta = useMemo(() => {
    return selectedStudentsForBulk.reduce(
      (acc, student) => {
        const course = getCourseCode(student);
        if (course === "TDC") acc.tdc += 1;
        else if (course === "PDC") acc.pdc += 1;
        else if (course === "PROMO") acc.promo += 1;
        else acc.other += 1;
        return acc;
      },
      { tdc: 0, pdc: 0, promo: 0, other: 0 }
    );
  }, [selectedStudentsForBulk]);

  const toggleSelectStudent = (id) => {
    setSelectedStudentIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      return [...current, id];
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedStudentIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !pagedStudentIds.includes(id));
      }

      const merged = new Set([...current, ...pagedStudentIds]);
      return Array.from(merged);
    });
  };

  const openBulkStatusModal = () => {
    if (selectedStudentIds.length === 0) {
      addToast("Select at least one student for bulk update.", "error");
      return;
    }

    setIsBulkStatusModalOpen(true);
  };

  const closeBulkStatusModal = () => {
    setIsBulkStatusModalOpen(false);
    setBulkStatusForm({
      tdcOutcome: "",
      pdcOutcome: "",
      promoTdcOutcome: "",
      promoPdcOutcome: "",
    });
  };

  const submitBulkStatusUpdate = (event) => {
    event.preventDefault();

    if (selectedStudentIds.length === 0) {
      addToast("No students selected.", "error");
      return;
    }

    if (bulkSelectionMeta.tdc > 0 && !bulkStatusForm.tdcOutcome) {
      addToast("Please choose a TDC outcome for selected TDC students.", "error");
      return;
    }

    if (bulkSelectionMeta.pdc > 0 && !bulkStatusForm.pdcOutcome) {
      addToast("Please choose a PDC outcome for selected PDC students.", "error");
      return;
    }

    if (bulkSelectionMeta.promo > 0 && (!bulkStatusForm.promoTdcOutcome || !bulkStatusForm.promoPdcOutcome)) {
      addToast("Please choose both Promo TDC and Promo PDC outcomes.", "error");
      return;
    }

    const updates = selectedStudentsForBulk
      .map((student) => {
        const course = getCourseCode(student);
        if (course === "TDC") {
          const outcome = bulkStatusForm.tdcOutcome;
          return {
            id: student.id,
            payload: {
              enrollmentStatus: mapOutcomeToEnrollmentStatus(outcome),
              courseOutcome: outcome,
              score: formatScoreValue("TDC", outcome),
            },
          };
        }

        if (course === "PDC") {
          const outcome = bulkStatusForm.pdcOutcome;
          return {
            id: student.id,
            payload: {
              enrollmentStatus: mapOutcomeToEnrollmentStatus(outcome),
              courseOutcome: outcome,
              score: formatScoreValue("PDC", outcome),
            },
          };
        }

        if (course === "PROMO") {
          const promoTdcOutcome = bulkStatusForm.promoTdcOutcome;
          const promoPdcOutcome = bulkStatusForm.promoPdcOutcome;
          const mappedFromPdc = mapOutcomeToEnrollmentStatus(promoPdcOutcome);
          const mappedFromTdc = mapOutcomeToEnrollmentStatus(promoTdcOutcome);
          const enrollmentStatus =
            mappedFromPdc === "completed" || mappedFromTdc === "completed"
              ? "completed"
              : mappedFromPdc === "pending" || mappedFromTdc === "pending"
                ? "pending"
                : "confirmed";

          return {
            id: student.id,
            payload: {
              enrollmentStatus,
              courseOutcome: `TDC:${promoTdcOutcome} | PDC:${promoPdcOutcome}`,
              score: formatPromoScoreValue(promoTdcOutcome, promoPdcOutcome),
            },
          };
        }

        return {
          id: student.id,
          payload: {
            enrollmentStatus: "confirmed",
          },
        };
      })
      .filter(Boolean);

    bulkStatusUpdateMutation.mutate({
      updates,
    });
  };

  const openEditModal = (student) => {
    setEditingStudent(student);
    setEditForm(mapStudentToEditForm(student));
  };

  const closeEditModal = () => {
    setEditingStudent(null);
  };

  const submitEdit = (event) => {
    event.preventDefault();
    if (!editingStudent) return;

    updateMutation.mutate({
      id: editingStudent.id,
      payload: {
        student: editForm.student,
        profile: editForm.profile,
      },
    });
  };

  const openStatusUpdateModal = (student) => {
    setUpdatingStatusStudent(student);
    const latestEnrollment = getLatestEnrollment(student);
    const courseCode = getCourseCode(student);
    const parsedScore = parseScoreValue(latestEnrollment?.score);
    const supportsPromoSections = courseCode === "PROMO" || hasPromoStatusContext(student);
    setStatusForm({
      enrollmentStatus: getEnrollmentLifecycleStatus(latestEnrollment, student),
      courseOutcome:
        supportsPromoSections
          ? parsedScore.promoCategory === "PDC"
            ? parsedScore.promoPdcOutcome || ""
            : parsedScore.promoTdcOutcome || ""
          : parsedScore.outcome || "",
      promoCategory: supportsPromoSections ? parsedScore.promoCategory || "TDC" : courseCode,
      promoTdcOutcome: parsedScore.promoTdcOutcome || "",
      promoPdcOutcome: parsedScore.promoPdcOutcome || "",
    });
  };

  const closeStatusUpdateModal = () => {
    setUpdatingStatusStudent(null);
    setStatusForm({
      enrollmentStatus: "",
      courseOutcome: "",
      promoCategory: "TDC",
      promoTdcOutcome: "",
      promoPdcOutcome: "",
    });
  };

  const submitStatusUpdate = (event) => {
    event.preventDefault();
    if (!updatingStatusStudent?.id) return;

    const courseCode = getCourseCode(updatingStatusStudent);
    const supportsPromoSections = courseCode === "PROMO" || hasPromoStatusContext(updatingStatusStudent);

    if (supportsPromoSections) {
      // Allow saving when at least one of TDC or PDC outcome is set.
      // This enables saving TDC outcome even when PDC is not yet set.
      if (!statusForm.promoTdcOutcome && !statusForm.promoPdcOutcome) {
        addToast("For Promo students, please set at least one of TDC or PDC outcomes.", "error");
        return;
      }
    }

    const isCancellingEnrollment = String(statusForm.enrollmentStatus || "").toLowerCase() === "cancelled";

    if (!isCancellingEnrollment && !statusForm.courseOutcome) {
      addToast("Please choose a course outcome.", "error");
      return;
    }

    let mappedEnrollmentStatus;
    if (isCancellingEnrollment) {
      mappedEnrollmentStatus = "cancelled";
    } else if (supportsPromoSections) {
      // If PDC outcome is present, use it to determine final enrollment status.
      // If only TDC outcome is set (PDC pending), keep existing enrollment status to avoid marking enrollment completed.
      if (statusForm.promoPdcOutcome) {
        mappedEnrollmentStatus = mapOutcomeToEnrollmentStatus(statusForm.promoPdcOutcome);
      } else if (statusForm.promoTdcOutcome) {
        const latest = getLatestEnrollment(updatingStatusStudent);
        mappedEnrollmentStatus = (latest && String(latest.status || "")?.toLowerCase()) || "pending";
      } else {
        mappedEnrollmentStatus = mapOutcomeToEnrollmentStatus(statusForm.courseOutcome);
      }
    } else {
      mappedEnrollmentStatus = mapOutcomeToEnrollmentStatus(statusForm.courseOutcome);
    }

    const scoreValue = isCancellingEnrollment
      ? "CANCELLED"
      : supportsPromoSections
        ? formatPromoScoreValue(statusForm.promoTdcOutcome, statusForm.promoPdcOutcome)
        : formatScoreValue(courseCode, statusForm.courseOutcome, statusForm.promoCategory);

    statusUpdateMutation.mutate({
      id: updatingStatusStudent.id,
      enrollmentStatus: mappedEnrollmentStatus,
      courseOutcome: statusForm.courseOutcome,
      promoCategory: statusForm.promoCategory,
      score: scoreValue,
    });
  };

  const quickApprovePendingStudent = (student) => {
    if (!student?.id) return;

    const latestEnrollment = getLatestEnrollment(student);
    const currentStatus = getEnrollmentLifecycleStatus(latestEnrollment, student);
    if (currentStatus !== "pending") return;

    const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ") || `Student #${student.id}`;
    const confirmed = window.confirm(`Accept pending enrollment for ${fullName}?`);
    if (!confirmed) return;

    statusUpdateMutation.mutate({
      id: student.id,
      enrollmentStatus: "confirmed",
    });
  };

  const confirmDelete = () => {
    if (deletingStudent?.id) {
      deleteMutation.mutate(deletingStudent.id);
    }
  };

  const toggleTableSort = (column) => {
    const nextByColumn = {
      student: { asc: "name_asc", desc: "name_desc" },
      contact: { asc: "contact_asc", desc: "contact_desc" },
      course: { asc: "course_asc", desc: "course_desc" },
      status: { asc: "status_asc", desc: "status_desc" },
    };

    const config = nextByColumn[column];
    if (!config) return;

    setSortBy((current) => {
      const isAsc = current === config.asc || (column === "status" && current === "status");
      const isDesc = current === config.desc;
      if (isAsc) return config.desc;
      if (isDesc) return config.asc;
      return config.asc;
    });
    setPage(1);
  };

  return {
    search,
    courseFilter,
    paymentFilter,
    statusFilter,
    sortBy,
    selectedStudent,
    editingStudent,
    editForm,
    deletingStudent,
    updatingStatusStudent,
    statusForm,
    selectedStudentIds,
    isBulkStatusModalOpen,
    bulkStatusForm,
    bulkSelectionMeta,
    allVisibleSelected,
    toasts,
    students: pagedStudents,
    summary,
    pagination,
    isLoading,
    isError,
    error,
    isUpdatingStudent: updateMutation.isPending,
    isDeletingStudent: deleteMutation.isPending,
    isUpdatingStatus: statusUpdateMutation.isPending,
    isBulkUpdatingStatus: bulkStatusUpdateMutation.isPending,
    setEditForm,
    setStatusForm,
    setBulkStatusForm,
    setSelectedStudent,
    setDeletingStudent,
    addToast,
    removeToast,
    setSearch: (value) => {
      setSearch(value);
      setPage(1);
    },
    setCourseFilter: (value) => {
      setCourseFilter(value);
      setPage(1);
      setSelectedStudentIds([]);
    },
    setPaymentFilter: (value) => {
      setPaymentFilter(value);
      setPage(1);
      setSelectedStudentIds([]);
    },
    setStatusFilter: (value) => {
      setStatusFilter(value);
      setPage(1);
      setSelectedStudentIds([]);
    },
    setSortBy: (value) => {
      setSortBy(value);
      setPage(1);
    },
    goToPreviousPage: () => setPage((current) => Math.max(1, current - 1)),
    goToNextPage: () => setPage((current) => Math.min(totalPages, current + 1)),
    toggleSelectStudent,
    toggleSelectAllVisible,
    openBulkStatusModal,
    closeBulkStatusModal,
    submitBulkStatusUpdate,
    clearSelection: () => setSelectedStudentIds([]),
    openEditModal,
    closeEditModal,
    submitEdit,
    openStatusUpdateModal,
    closeStatusUpdateModal,
    submitStatusUpdate,
    quickApprovePendingStudent,
    confirmDelete,
    toggleTableSort,
    refetchStudents: () => queryClient.invalidateQueries({ queryKey: ["students"] }),
  };
}
