import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, QrCode, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../services/api";
import { buildQrEnrollmentTemplate, QR_ENROLLMENT_TEMPLATE } from "../shared/qrEnrollmentTemplate";

function resolvePublicQrBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_PUBLIC_QR_BASE_URL;

  if (configuredBaseUrl && typeof configuredBaseUrl === "string") {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
}

const PUBLIC_QR_BASE_URL = resolvePublicQrBaseUrl();

function publicUrl(token) {
  const baseUrl = PUBLIC_QR_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${baseUrl}/enroll?token=${encodeURIComponent(token)}`;
}

function defaultTemplateSummary(template) {
  if (!template || typeof template !== "object") {
    return QR_ENROLLMENT_TEMPLATE;
  }

  if (Array.isArray(template.sections) && template.sections.length > 0) {
    return { ...QR_ENROLLMENT_TEMPLATE, ...template };
  }

  if (Array.isArray(template.fields)) {
    return {
      ...QR_ENROLLMENT_TEMPLATE,
      ...template,
      sections: [
        {
          title: "Enrollment",
          description: "Basic fields supplied by the QR code.",
          fields: template.fields,
        },
      ],
    };
  }

  return QR_ENROLLMENT_TEMPLATE;
}

function QRPreview({ token, image, revoked }) {
  return (
    <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm card-light">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Public Link</p>
          <p className="mt-1 break-all text-sm text-slate-700">{publicUrl(token)}</p>
        </div>
        <a
          href={publicUrl(token)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ExternalLink size={14} />
          Open
        </a>
      </div>
      <div className="flex min-h-[192px] items-center justify-center rounded-2xl bg-slate-950 p-4">
        {image ? (
          <img src={image} alt="QR code preview" className="h-40 w-40 rounded-2xl bg-white p-2" />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300">
            Generating...
          </div>
        )}
      </div>
      <div className={`rounded-2xl px-4 py-3 text-xs font-semibold ${revoked ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
        {revoked ? "This QR code is revoked." : "This QR code is active and can accept submissions."}
      </div>
    </div>
  );
}

export default function QRCodeAdminPage() {
  const [qrcodes, setQRCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [enrollmentType, setEnrollmentType] = useState("TDC");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [qrImages, setQrImages] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadQRCodes() {
      try {
        const data = await api.get("/admin/qrcodes");

        if (!cancelled) {
          setQRCodes(Array.isArray(data) ? data : []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError?.message || "Failed to load QR codes.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadQRCodes();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateImages() {
      const entries = await Promise.all(
        qrcodes.map(async (qr) => {
          try {
            const url = publicUrl(qr.token);
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
            return [qr.id, qrApiUrl];
          } catch {
            return [qr.id, null];
          }
        })
      );

      if (!cancelled) {
        setQrImages(Object.fromEntries(entries));
      }
    }

    if (qrcodes.length > 0) {
      hydrateImages();
    } else {
      Promise.resolve().then(() => {
        setQrImages({});
      });
    }

    return () => {
      cancelled = true;
    };
  }, [qrcodes]);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError("");

    try {
      const template = buildQrEnrollmentTemplate(enrollmentType);
      const data = await api.post("/admin/qrcodes", {
        name,
        template: defaultTemplateSummary(template),
      });

      setQRCodes((current) => [data, ...current]);
      setName("");
    } catch (createError) {
      setError(createError?.message || "Failed to create QR code.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id) {
    setError("");
    try {
      await api.patch(`/admin/qrcodes/${id}/revoke`, {});

      setQRCodes((current) => current.map((qr) => (qr.id === id ? { ...qr, revoked: true } : qr)));
    } catch (revokeError) {
      setError(revokeError?.message || "Failed to revoke QR code.");
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm("Delete this QR code permanently? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setError("");

    try {
      await api.delete(`/admin/qrcodes/${id}`);
      setQRCodes((current) => current.filter((qr) => qr.id !== id));
    } catch (deleteError) {
      setError(deleteError?.message || "Failed to delete QR code.");
    }
  }

  async function copyLink(qr) {
    await navigator.clipboard.writeText(publicUrl(qr.token));
  }

  const activeCount = useMemo(() => qrcodes.filter((qr) => !qr.revoked).length, [qrcodes]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_55%,_#f8f5f2_100%)] px-4 py-8 text-slate-900 card-light">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] card-light">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-[#800000]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#800000]">
                <QrCode size={14} />
                QR Admin
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                QR code management
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Generate public enrollment QR codes, publish the form link, and revoke access when a campaign or intake closes.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
              <div className="card-light rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Total</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{qrcodes.length}</p>
              </div>
              <div className="card-light rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Active</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{activeCount}</p>
              </div>
              <div className="card-light rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Revoked</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{qrcodes.length - activeCount}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm card-light">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#800000]/10 text-[#800000]">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-950">Create QR code</h2>
                <p className="text-sm text-slate-600">The default template is prefilled for the public enrollment page.</p>
              </div>
            </div>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Enrollment Type</span>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {[
                    { value: "TDC", label: "TDC Enrollment", description: "Technical Driving Course" },
                    { value: "PDC", label: "PDC Enrollment", description: "Professional Driving Course" },
                    { value: "PROMO", label: "TDC + PDC Promo", description: "Combined Program" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEnrollmentType(option.value)}
                      className={`rounded-2xl border-2 px-4 py-3 text-left transition ${
                        enrollmentType === option.value
                          ? "border-[#800000] bg-[#800000]/5 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                      <p className="text-xs text-slate-500">{option.description}</p>
                    </button>
                  ))}
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">QR name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Example: August 2026 Enrollment"
                  required
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10"
                />
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                This QR code will direct to a public <span className="font-semibold text-slate-900">{enrollmentType}</span> enrollment form.
              </div>

              {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#800000] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(128,0,0,0.22)] transition hover:bg-[#680000] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                {creating ? "Creating QR..." : "Generate QR"}
              </button>
            </form>
          </section>

          <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm card-light">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Published QR codes</h2>
                <p className="text-sm text-slate-600">Each card shows the public form link and a generated QR image.</p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {loading ? "Loading..." : `${qrcodes.length} records`}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600 card-light">
                <Loader2 size={16} className="animate-spin" />
                Loading QR codes...
              </div>
            ) : null}

            {!loading && qrcodes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 card-light">
                No QR codes yet. Create one to start accepting public enrollment submissions.
              </div>
            ) : null}

            <div className="grid gap-4">
              {qrcodes.map((qr) => (
                <article key={qr.id} className="grid gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[1fr_240px] card-light">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{qr.revoked ? "Revoked" : "Active"}</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-950">{qr.name}</h3>
                        <p className="mt-1 text-sm text-slate-600">Token: <span className="break-all font-mono text-xs text-slate-500">{qr.token}</span></p>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-xs font-semibold ${qr.revoked ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {qr.revoked ? "Revoked" : "Live"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyLink(qr)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Copy size={14} />
                        Copy link
                      </button>
                      {!qr.revoked ? (
                        <button
                          type="button"
                          onClick={() => handleRevoke(qr.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          <RotateCcw size={14} />
                          Revoke
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDelete(qr.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Created</div>
                        <div className="mt-1 text-slate-900">{qr.createdAt ? new Date(qr.createdAt).toLocaleString() : "-"}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Template</div>
                        <div className="mt-1 text-slate-900">{qr.template?.name || "Default public enrollment"}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sections</div>
                        <div className="mt-1 text-slate-900">{qr.template?.sections?.length || 0}</div>
                      </div>
                    </div>
                  </div>

                  <QRPreview token={qr.token} image={qrImages[qr.id]} revoked={qr.revoked} />
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
