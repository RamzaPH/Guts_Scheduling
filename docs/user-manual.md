# GUTS User Manual (Updated)

This manual covers typical end-user and administrator workflows for the GUTS system, plus brief guidance for operators and support staff.

If you need an on-site walkthrough, contact your system administrator and request the demo account or a recorded session.

--

## Quick overview

- Purpose: manage school operations — students, enrollments, payments, instructors, vehicles, promos, and reports.
- Access: role-based (Admin, Sub-admin, Staff). Your visible pages and actions depend on your role.

## 1. Roles & access

- Admin: full access to settings, user management, backups, and reports.
- Sub-admin: limited admin tasks (depends on role assignments).
- Staff: daily workflows — enrollments, student records, and basic reporting.

If you need additional access, request it from an Admin and explain why.

## 2. Getting started

1. Open the application URL in a modern browser (Chrome/Edge/Firefox recommended).
2. Sign in using your corporate or assigned account.
3. If prompted to change a temporary password, do so immediately.

Tip: Save the application URL as a bookmark and do not share your password.

## 3. Navigating the app

- Top navigation: primary areas (Dashboard, Students, Enrollments, Reports, Settings).
- Left sidebar: contextual links and quick filters (role-dependent).
- Global search: find students, enrollments, or invoices quickly.

## 4. Dashboard (first view)

The dashboard provides an at-a-glance summary:
- Pending approvals and enrollments
- Recent activity feed
- Summary cards (counts, payments, schedules)
- Quick actions (create enrollment, new student)

Use dashboard cards to jump to the related page for details.

## 5. Managing Enrollments (step-by-step)

Creating a new enrollment:

1. Go to Enrollments > New Enrollment.
2. Search or create a Student record.
3. Select package, schedule, and any promos.
4. Capture payment or select pending payment status.
5. Save. Confirm enrollment appears in the Pending list (if applicable).

Approving / reviewing enrollments:

- Open Enrollments > Pending.
- Review details, payment status, and attached documents.
- Approve or request changes — use the comments field for context.

QR-based enrollments:

- Scan the QR from the applicant's phone, or import pending QR enrollments from the pending QR queue.
- Verify payment if the flow requires it, then finalize the enrollment.

## 6. Student records

Common actions:
- Open Students > Search and filter the list.
- Click a student's name to open the profile.
- Edit contact info, emergency contacts, medical notes, and enrollment history.
- Use activity/timeline to review interactions and payments.

Note: Deleting student records is restricted. If needed, contact an Admin.

## 7. Payments & Invoices

- Payments can be captured during enrollment or recorded later.
- Invoices are generated for paid packages and can be exported/printed.
- Refunds and adjustments require Admin permissions.

If a payment fails to appear, check the enrollment's payment tab and the pending payments queue.

## 8. Reports and exports

- Use Reports > Overview for daily and monthly summaries.
- Export CSV or PDF for external processing or printing.
- Scheduling reports: Admins can configure scheduled exports in Settings.

## 9. Notifications and activity feed

- The bell icon shows system notifications and quick links to items requiring action.
- Click a notification to jump to the related screen.
- Mark notifications as read when addressed.

## 10. Settings (Admin area)

Admin capabilities include:
- User and role management
- Instructors and vehicles management
- Promo offers and pricing
- System options (email templates, calendar defaults)
- Backup and restore (see Admin operations)

Changes to settings may take effect immediately; coordinate major changes with other Admins.

## 11. QR enrollment flow (summary)

1. Applicant opens the public QR link and completes the form.
2. The application creates a pending QR enrollment record.
3. Staff review pending QR enrollments and confirm payment status.
4. Finalize enrollment into the system and notify the applicant.

If you see many pending QR enrollments, check payment gateway connectivity or queued jobs.

## 12. Admin operations (backups, restores, deployments)

Backups:
- Backups are stored in `backups/` and follow a timestamped naming convention.
- Admins should verify backups after automated runs and before major upgrades.

Restore:
- Restores are sensitive and should be performed during maintenance windows.
- Contact the technical lead for help; provide the backup filename and target environment.

Deployments:
- The system runs in Docker Compose in production; see `docker-compose.yml` and `docker-compose.prod.yml`.
- For self-hosted or local development, follow the `README.md` at the repository root.

## 13. Running locally (dev notes for power users)

This is a quick guide; use only if you are comfortable with Docker and Node.js.

1. Clone the repository and copy the `.env` template.
2. Install dependencies: `npm install` in `backend/` and `frontend/`.
3. Start services: `docker-compose up --build` (or use provided scripts).

Environment files and keys are in the repository root and `backend/config` — do not commit secrets.

## 14. Troubleshooting (common issues)

- Can't sign in:
	- Confirm email/password and account active status.
	- Ask an Admin to check user record if needed.
- Missing menu items:
	- Verify role permissions.
- Page looks incomplete or data missing:
	- Refresh, clear browser cache, or try another browser.
- Payments not visible:
	- Check the pending payments queue and the enrollment's payment tab.

When in doubt, collect screenshots, the affected user account, timestamp, and a short description before escalating.

## 15. Support and contacts

- First-line support: your local Admin or IT contact.
- Technical support / developer contact: see the internal `README.md` or reach out to the on-call engineer.

Include environment (production/staging), account email, and exact error messages when reporting issues.

## 16. Appendices

- Glossary: Student, Enrollment, Invoice, Promo, Instructor, Vehicle.
- File locations of interest:
	- [repo root README](../README.md)
	- Backups: `backups/`
	- Environment: `.env` (root)

## 17. Screenshots — where to capture and what to include

Add screenshots to help users follow the UI. Store images under `docs/images/screenshots/` using descriptive filenames.

Suggested screenshots to capture (file name suggestions):

- Login page — `login.png` — show email/password fields and an example error state.
- Dashboard — `dashboard.png` — full dashboard view including summary cards and activity feed.
- New enrollment flow (multi-step):
	- `enrollment-step1-student.png` — student search / create screen.
	- `enrollment-step2-package.png` — package/schedule selection screen.
	- `enrollment-step3-payment.png` — payment capture / confirmation screen.
- Pending enrollments list — `pending-enrollments.png` — filters and status columns visible.
- QR pending queue — `qr-pending.png` — example QR enrollment record and payment flag.
- Student profile — `student-profile.png` — contact, emergency contacts, and enrollment history.
- Payment / Invoice view — `payment-invoice.png` — invoice layout with payment status.
- Reports export modal — `reports-export.png` — export options and sample output preview.
- Notifications dropdown — `notifications.png` — sample notification and action link.
- Settings: Users & Roles — `settings-users-roles.png` — role assignment UI.
- Backups list — `backups-list.png` — backup filenames and restore button.
- Common error example — `error-authorization.png` — authorization/login error or incomplete page state.

For each screenshot include a short caption and any redaction/annotation needed (hide personal data). Recommended image format: PNG. Use the filename convention `YYYYMMDD-section-desc.png` when practical.

Where to place screenshots in this manual (placeholders):

- After **Getting started** (`## 2. Getting started`) — add `login.png`.
- After **Dashboard (first view)** (`## 4. Dashboard`) — add `dashboard.png`.
- Inline in **Managing Enrollments** (`## 5. Managing Enrollments`) — add the three `enrollment-step*.png` images next to each step.
- After **Student records** (`## 6. Student records`) — add `student-profile.png`.
- After **Payments & Invoices** (`## 7. Payments & Invoices`) — add `payment-invoice.png`.
- After **Reports and exports** (`## 8. Reports and exports`) — add `reports-export.png`.
- After **Notifications and activity feed** (`## 9. Notifications and activity feed`) — add `notifications.png`.
- After **Settings (Admin area)** (`## 10. Settings`) — add `settings-users-roles.png`.
- After **Admin operations** (`## 12. Admin operations`) — add `backups-list.png`.
- In **Troubleshooting** (`## 14. Troubleshooting`) — add `error-authorization.png` as an example.

Placeholder markup examples (copy into the document where appropriate):

![Login screen placeholder](images/screenshots/login.png)  
*Screenshot: Login screen — replace with actual image.*

If you want, I can create the `docs/images/screenshots/` folder and add placeholder image files (empty PNGs) with the suggested filenames. Tell me if you want me to generate those placeholders now.

## 18. Change log

- 2026-05-22: Updated manual to include expanded workflows, admin operations, troubleshooting, and screenshot guidance.
--

If you want this translated into Filipino, or prefer a short quickstart for staff only, tell me which sections to prioritize and I will produce a revised version.
