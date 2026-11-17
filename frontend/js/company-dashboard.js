
const COMPANY_API = "http://127.0.0.1:5000/api";

document.addEventListener("DOMContentLoaded", async () => {

    const $ = (id) => document.getElementById(id);

    const welcome = $("welcome-message");
    const list = $("postings-list");
    const message = $("dashboard-message");
    const formPanel = $("posting-form-panel");
    const form = $("opportunity-form");
    const createButton = $("create-posting-btn");
    const saveButton = $("save-posting-btn");
    const logoutButton = $("logout-btn");
    const applicationsList = $("applications-list");
    const applicationsMessage = $("applications-message");

    let opportunities = [];
    let applications = [];
    let editingId = null;
    let authenticated = false;

    // =====================================================
    // NOTIFICATIONS
    // =====================================================

    function notify(text, error = false) {
        message.textContent = text;
        message.className = error
            ? "message error"
            : "message success-text";
    }

    function notifyApplications(text, error = false) {
        applicationsMessage.textContent = text;
        applicationsMessage.className = error
            ? "message error"
            : "message success-text";
    }

    // =====================================================
    // API REQUEST HANDLER
    // =====================================================

    async function api(path, options = {}) {

        const response = await fetch(COMPANY_API + path, {
            credentials: "include",
            ...options,
            headers: {
                ...(options.body ? {
                    "Content-Type": "application/json"
                } : {}),
                ...(options.headers || {})
            }
        });

        if (response.status === 401) {
            window.location.replace("login.html");
            throw new Error("Session expired. Please log in again.");
        }

        const result = response.status === 204
            ? null
            : await response.json();

        if (!response.ok) {
            throw new Error(
                result?.error || "Request failed."
            );
        }

        return result;
    }

    // =====================================================
    // GENERAL UI HELPERS
    // =====================================================

    function makeButton(label, className, handler) {

        const button = document.createElement("button");

        button.type = "button";
        button.textContent = label;
        button.className = className;

        button.addEventListener("click", handler);

        return button;
    }

    function addText(parent, tag, value) {

        const element = document.createElement(tag);

        element.textContent = value;

        parent.appendChild(element);

        return element;
    }

    function formatDate(value) {

        if (!value) return "Not available";

        const date = new Date(value.replace(" ", "T"));

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function formatStatus(status) {

        const labels = {
            submitted: "Submitted",
            pending: "Pending",
            under_review: "Under Review",
            accepted: "Accepted",
            rejected: "Rejected"
        };

        return labels[status] || status;
    }

    // =====================================================
    // OPPORTUNITY MANAGEMENT
    // =====================================================

    function renderPostings() {

        list.replaceChildren();

        $("postings-count").textContent = opportunities.length;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        $("active-count").textContent = opportunities.filter(item => {

            if (item.status !== "open") return false;

            if (!item.deadline) return true;

            const deadline = new Date(item.deadline + "T00:00:00");

            return deadline >= today;

        }).length;

        if (!opportunities.length) {

            addText(list, "p", "No opportunities posted yet.");

            return;
        }

        for (const opportunity of opportunities) {

            const card = document.createElement("article");

            card.className = "posting";

            addText(card, "h3", opportunity.title);

            addText(
                card,
                "p",
                "Type: " + opportunity.opportunity_type.toUpperCase()
            );

            addText(
                card,
                "p",
                "Location: " + (opportunity.location || "Not specified")
            );

            addText(
                card,
                "p",
                "Deadline: " + (opportunity.deadline || "No deadline")
            );

            addText(card, "p", opportunity.description);

            const status = addText(
                card,
                "span",
                "Status: " + opportunity.status.toUpperCase()
            );

            status.className = "status";

            const actions = document.createElement("div");

            actions.className = "actions";

            actions.appendChild(
                makeButton("Edit", "secondary", () => {
                    openForm(opportunity);
                })
            );

            if (opportunity.status === "open") {

                actions.appendChild(
                    makeButton("Close", "secondary", async () => {

                        if (!confirm("Close this opportunity?")) return;

                        try {

                            await api(
                                `/opportunities/${opportunity.id}`,
                                {
                                    method: "PUT",
                                    body: JSON.stringify({
                                        status: "closed"
                                    })
                                }
                            );

                            await loadPostings();

                            notify("Opportunity closed successfully.");

                        } catch (error) {

                            notify(error.message, true);
                        }
                    })
                );
            }

            actions.appendChild(
                makeButton("Delete", "danger", async () => {

                    if (!confirm(
                        `Delete "${opportunity.title}" permanently?`
                    )) return;

                    try {

                        await api(
                            `/opportunities/${opportunity.id}`,
                            { method: "DELETE" }
                        );

                        await loadPostings();

                        notify("Opportunity deleted successfully.");

                    } catch (error) {

                        notify(error.message, true);
                    }
                })
            );

            card.appendChild(actions);

            list.appendChild(card);
        }
    }

    async function loadPostings() {

        const result = await api("/company/opportunities");

        opportunities = result.opportunities || [];

        renderPostings();
    }

    // =====================================================
    // CREATE / EDIT OPPORTUNITY
    // =====================================================

    function openForm(opportunity = null) {

        if (!authenticated) return;

        editingId = opportunity ? opportunity.id : null;

        form.reset();

        $("form-title").textContent = opportunity
            ? "Edit Opportunity"
            : "Create Opportunity";

        if (opportunity) {

            $("job-title").value = opportunity.title;
            $("job-description").value = opportunity.description;
            $("job-type").value = opportunity.opportunity_type;
            $("job-location").value = opportunity.location || "";
            $("job-deadline").value = opportunity.deadline || "";
            $("job-status").value = opportunity.status;

            $("job-status").disabled =
                opportunity.status === "closed";

        } else {

            $("job-status").disabled = false;
        }

        formPanel.classList.remove("hidden");

        formPanel.scrollIntoView({
            behavior: "smooth"
        });
    }

    function closeForm() {

        editingId = null;

        form.reset();

        $("job-status").disabled = false;

        formPanel.classList.add("hidden");
    }

    form.addEventListener("submit", async (event) => {

        event.preventDefault();

        const payload = {
            title: $("job-title").value.trim(),
            description: $("job-description").value.trim(),
            opportunity_type: $("job-type").value,
            location: $("job-location").value.trim() || null,
            deadline: $("job-deadline").value || null,
            status: $("job-status").value
        };

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {

            const path = editingId === null
                ? "/opportunities"
                : `/opportunities/${editingId}`;

            const method = editingId === null ? "POST" : "PUT";

            await api(path, {
                method,
                body: JSON.stringify(payload)
            });

            closeForm();

            await loadPostings();

            notify("Opportunity saved successfully.");

        } catch (error) {

            notify(error.message, true);

        } finally {

            saveButton.disabled = false;
            saveButton.textContent = "Save Opportunity";
        }
    });

    createButton.addEventListener("click", () => openForm());

    $("cancel-posting-btn").addEventListener("click", closeForm);

    // =====================================================
    // APPLICANT DETAILS POPUP
    // =====================================================

    function showApplicantDetails(application) {

        $("detail-name").textContent =
            application.student_name || "Not available";

        $("detail-email").textContent =
            application.student_email || "Not available";

        $("detail-position").textContent =
            application.opportunity_title || "Not available";

        $("detail-date").textContent =
            formatDate(application.applied_at);

        $("detail-status").textContent =
            formatStatus(application.status);

        $("applicant-modal").classList.add("active");

        $("close-applicant-modal").focus();
    }

    function closeApplicantDetails() {

        $("applicant-modal").classList.remove("active");
    }

    $("close-applicant-modal").addEventListener(
        "click",
        closeApplicantDetails
    );

    $("applicant-modal").addEventListener("click", (event) => {

        if (event.target === $("applicant-modal")) {
            closeApplicantDetails();
        }
    });

    document.addEventListener("keydown", (event) => {

        if (
            event.key === "Escape" &&
            $("applicant-modal").classList.contains("active")
        ) {
            closeApplicantDetails();
        }
    });

    // =====================================================
    // LOAD COMPANY APPLICATIONS
    // =====================================================

    function renderApplications() {

        applicationsList.replaceChildren();

        $("applications-count").textContent = applications.length;

        if (!applications.length) {

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 5;
            cell.className = "empty-state";
            cell.textContent = "No applications received yet.";

            row.appendChild(cell);
            applicationsList.appendChild(row);

            return;
        }

        for (const application of applications) {

            const row = document.createElement("tr");

            // APPLICANT

            const applicantCell = document.createElement("td");

            const name = addText(
                applicantCell,
                "span",
                application.student_name || "Unknown Student"
            );

            name.className = "applicant-name";

            const email = addText(
                applicantCell,
                "span",
                application.student_email || "No email"
            );

            email.className = "applicant-email";

            // POSITION

            const positionCell = document.createElement("td");

            positionCell.textContent =
                application.opportunity_title || "Unknown Position";

            // DATE

            const dateCell = document.createElement("td");

            dateCell.textContent = formatDate(application.applied_at);

            // STATUS

            const statusCell = document.createElement("td");

            const statusBadge = addText(
                statusCell,
                "span",
                formatStatus(application.status)
            );

            statusBadge.className =
                "status " + application.status;

            // ACTIONS

            const actionsCell = document.createElement("td");

            const actionContainer = document.createElement("div");

            actionContainer.className = "actions";

            const viewButton = makeButton(
                "View",
                "view-btn",
                () => showApplicantDetails(application)
            );

            const statusControl = document.createElement("div");

            statusControl.className = "status-control";

            const statusSelect = document.createElement("select");

            const statusOptions = [
                ["submitted", "Submitted"],
                ["under_review", "Under Review"],
                ["accepted", "Accepted"],
                ["rejected", "Rejected"]
            ];

            statusOptions.forEach(([value, label]) => {

                const option = document.createElement("option");

                option.value = value;
                option.textContent = label;

                statusSelect.appendChild(option);
            });

            statusSelect.value = application.status;

            const saveStatusButton = makeButton(
                "Save",
                "primary",
                async () => {

                    const newStatus = statusSelect.value;

                    if (newStatus === application.status) {

                        notifyApplications(
                            "No status changes were made."
                        );

                        return;
                    }

                    saveStatusButton.disabled = true;
                    saveStatusButton.textContent = "Saving...";

                    try {

                        const result = await api(
                            `/applications/${application.id}`,
                            {
                                method: "PATCH",
                                body: JSON.stringify({
                                    status: newStatus
                                })
                            }
                        );

                        application.status =
                            result.application.status;

                        await loadApplications();

                        notifyApplications(
                            "Application status updated successfully."
                        );

                    } catch (error) {

                        notifyApplications(error.message, true);

                    } finally {

                        saveStatusButton.disabled = false;
                        saveStatusButton.textContent = "Save";
                    }
                }
            );

            statusControl.append(
                statusSelect,
                saveStatusButton
            );

            actionContainer.append(
                viewButton,
                statusControl
            );

            actionsCell.appendChild(actionContainer);

            row.append(
                applicantCell,
                positionCell,
                dateCell,
                statusCell,
                actionsCell
            );

            applicationsList.appendChild(row);
        }
    }

    async function loadApplications() {

        applicationsList.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    Loading applications...
                </td>
            </tr>
        `;

        const result = await api("/company/applications");

        applications = result.applications || [];

        renderApplications();
    }

    // REFRESH APPLICATIONS BUTTON

    $("refresh-applications-btn").addEventListener(
        "click",
        async () => {

            const button = $("refresh-applications-btn");

            button.disabled = true;
            button.textContent = "Refreshing...";

            try {

                await loadApplications();

                notifyApplications(
                    "Applications refreshed successfully."
                );

            } catch (error) {

                notifyApplications(error.message, true);

            } finally {

                button.disabled = false;
                button.textContent = "Refresh";
            }
        }
    );

    // =====================================================
    // LOGOUT
    // =====================================================

    logoutButton.addEventListener("click", async () => {

        logoutButton.disabled = true;

        try {

            await api("/auth/logout", {
                method: "POST"
            });

            window.location.replace("login.html");

        } catch (error) {

            notify(error.message, true);

            logoutButton.disabled = false;
        }
    });

    // =====================================================
    // INITIALIZE COMPANY DASHBOARD
    // =====================================================

    try {

        const result = await api("/auth/me");

        if (
            !result.user ||
            result.user.role !== "company"
        ) {

            window.location.replace("login.html");

            return;
        }

        await api("/company/dashboard");

        authenticated = true;

        welcome.textContent =
            `Welcome, ${result.user.full_name}!`;

        createButton.disabled = false;

        await loadPostings();

        await loadApplications();

        notify("Company dashboard loaded successfully.");

    } catch (error) {

        notify(error.message, true);

        list.textContent =
            "Unable to load company opportunities.";

        applicationsList.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    Unable to load applications.
                </td>
            </tr>
        `;
    }

});
