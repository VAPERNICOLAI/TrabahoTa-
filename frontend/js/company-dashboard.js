
const COMPANY_API = (["localhost", "127.0.0.1"].includes(window.location.hostname) ? "http://127.0.0.1:5000" : "") + "/api";

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

    const applicationTransitions = {
        submitted: ["under_review"],
        pending: ["under_review"],
        under_review: ["accepted", "rejected"],
        accepted: [],
        rejected: [],
        withdrawn: []
    };

    const updatingApplications = new Set();
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
            rejected: "Rejected",
            withdrawn: "Withdrawn"
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


    let applicantProfileRequest = 0;
    let previousApplicantFocus = null;


    // =====================================================
    // APPLICANT RESUME MANAGEMENT
    // =====================================================

    let currentApplicantResume = null;
    let currentResumeApplicationId = null;
    let resumeDownloadBusy = false;

    function showApplicantResumeMessage(text = "", type = "") {
        const message = $("applicant-resume-message");

        message.textContent = text;
        message.className = "applicant-resume-message";

        if (type) {
            message.classList.add(type);
        }
    }

    function formatApplicantResumeSize(bytes) {

        if (bytes < 1024) {
            return `${bytes} bytes`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function resetApplicantResume() {

        currentApplicantResume = null;
        currentResumeApplicationId = null;
        resumeDownloadBusy = false;

        $("applicant-resume-card").hidden = true;
        $("applicant-resume-empty").hidden = true;

        $("applicant-resume-name").textContent = "";
        $("applicant-resume-size").textContent = "";
        $("applicant-resume-updated").textContent = "";

        $("applicant-resume-download").disabled = true;

        showApplicantResumeMessage();
    }

    function isCurrentApplicantRequest(requestId) {

        return (
            requestId === applicantProfileRequest &&
            $("applicant-modal").classList.contains("active")
        );
    }

    async function loadApplicantResume(applicationId, requestId) {

        resetApplicantResume();

        showApplicantResumeMessage(
            "Loading applicant résumé...",
            "info"
        );

        try {

            const result = await api(
                "/company/applications/" +
                applicationId +
                "/resume"
            );

            if (!isCurrentApplicantRequest(requestId)) {
                return;
            }

            if (!result || !("resume" in result)) {
                throw new Error("Invalid résumé response.");
            }

            currentApplicantResume = result.resume;
            currentResumeApplicationId = applicationId;

            if (!currentApplicantResume) {

                $("applicant-resume-card").hidden = true;
                $("applicant-resume-empty").hidden = false;

                showApplicantResumeMessage();

                return;
            }

            $("applicant-resume-name").textContent =
                currentApplicantResume.file_name;

            $("applicant-resume-size").textContent =
                formatApplicantResumeSize(
                    currentApplicantResume.file_size
                ) + " · PDF document";

            $("applicant-resume-updated").textContent =
                "Updated: " +
                formatDate(currentApplicantResume.updated_at);

            $("applicant-resume-card").hidden = false;
            $("applicant-resume-empty").hidden = true;

            $("applicant-resume-download").disabled = false;

            showApplicantResumeMessage();

        } catch (error) {

            if (!isCurrentApplicantRequest(requestId)) {
                return;
            }

            resetApplicantResume();

            showApplicantResumeMessage(
                error.message || "Unable to load applicant résumé.",
                "error"
            );
        }
    }

    async function downloadApplicantResume() {

        if (
            resumeDownloadBusy ||
            !currentApplicantResume ||
            currentResumeApplicationId === null
        ) {
            return;
        }

        const requestId = applicantProfileRequest;
        const applicationId = currentResumeApplicationId;
        const filename = currentApplicantResume.file_name;

        const button = $("applicant-resume-download");

        resumeDownloadBusy = true;
        button.disabled = true;

        showApplicantResumeMessage(
            "Preparing résumé download...",
            "info"
        );

        try {

            const response = await fetch(
                COMPANY_API +
                "/company/applications/" +
                applicationId +
                "/resume/download",
                {
                    credentials: "include",
                    cache: "no-store"
                }
            );

            if (!isCurrentApplicantRequest(requestId)) {
                return;
            }

            if (response.status === 401) {

                window.location.replace("login.html");

                throw new Error(
                    "Session expired. Please log in again."
                );
            }

            if (!response.ok) {

                const result = await response.json()
                    .catch(() => null);

                throw new Error(
                    result?.error || "Unable to download résumé."
                );
            }

            const blob = await response.blob();

            if (!isCurrentApplicantRequest(requestId)) {
                return;
            }

            if (blob.type !== "application/pdf") {
                throw new Error("Invalid PDF download response.");
            }

            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");

            anchor.href = url;
            anchor.download = filename;

            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            setTimeout(
                () => URL.revokeObjectURL(url),
                10000
            );

            showApplicantResumeMessage(
                "Résumé download started.",
                "success"
            );

        } catch (error) {

            if (!isCurrentApplicantRequest(requestId)) {
                return;
            }

            showApplicantResumeMessage(
                error.message || "Unable to download résumé.",
                "error"
            );

        } finally {

            if (isCurrentApplicantRequest(requestId)) {

                resumeDownloadBusy = false;

                button.disabled = !currentApplicantResume;
            }
        }
    }

    $("applicant-resume-download").addEventListener(
        "click",
        downloadApplicantResume
    );


    let applicantPictureURL = null;
    let applicantPictureController = null;

    function resetApplicantPicture() {
        if (applicantPictureController) {
            applicantPictureController.abort();
            applicantPictureController = null;
        }

        if (applicantPictureURL) {
            URL.revokeObjectURL(applicantPictureURL);
            applicantPictureURL = null;
        }

        const picture = $("applicant-picture");

        picture.removeAttribute("src");
        picture.hidden = true;

        $("applicant-picture-initial").hidden = false;
        $("applicant-picture-initial").textContent = "S";
        $("applicant-picture-message").textContent = "";
        $("applicant-picture-container").hidden = true;
    }

    async function loadApplicantPicture(
        applicationId,
        requestId,
        fullName
    ) {
        if (!isCurrentApplicantRequest(requestId)) {
            return;
        }

        resetApplicantPicture();

        const container = $("applicant-picture-container");
        const picture = $("applicant-picture");
        const initial = $("applicant-picture-initial");
        const message = $("applicant-picture-message");

        initial.textContent = String(fullName || "Student")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(word => word.charAt(0).toUpperCase())
            .join("") || "S";

        container.hidden = false;

        message.textContent =
            "Loading profile picture...";

        const controller = new AbortController();

        applicantPictureController = controller;

        try {
            const response = await fetch(
                COMPANY_API +
                "/company/applications/" +
                applicationId +
                "/student-image",
                {
                    credentials: "include",
                    cache: "no-store",
                    signal: controller.signal
                }
            );

            if (
                controller.signal.aborted ||
                !isCurrentApplicantRequest(requestId)
            ) {
                return;
            }

            if (response.status === 401) {
                window.location.replace("login.html");
                return;
            }

            if (response.status === 404) {
                message.textContent =
                    "No profile picture available.";
                return;
            }

            if (response.status === 403) {
                resetApplicantPicture();
                return;
            }

            if (!response.ok) {
                throw new Error(
                    "Unable to retrieve profile picture."
                );
            }

            const blob = await response.blob();

            if (
                controller.signal.aborted ||
                !isCurrentApplicantRequest(requestId)
            ) {
                return;
            }

            if (blob.type !== "image/webp") {
                throw new Error(
                    "Invalid profile picture response."
                );
            }

            applicantPictureURL =
                URL.createObjectURL(blob);

            picture.src = applicantPictureURL;

            await picture.decode();

            if (
                controller.signal.aborted ||
                !isCurrentApplicantRequest(requestId)
            ) {
                return;
            }

            picture.hidden = false;
            initial.hidden = true;
            message.textContent = "";

        } catch (error) {
            if (
                error.name === "AbortError" ||
                controller.signal.aborted ||
                !isCurrentApplicantRequest(requestId)
            ) {
                return;
            }

            if (applicantPictureURL) {
                URL.revokeObjectURL(applicantPictureURL);
                applicantPictureURL = null;
            }

            picture.removeAttribute("src");
            picture.hidden = true;
            initial.hidden = false;

            message.textContent =
                "Profile picture unavailable.";

        } finally {
            if (
                applicantPictureController === controller
            ) {
                applicantPictureController = null;
            }
        }
    }


    function resetApplicantProfile() {
        resetApplicantPicture();
        resetApplicantResume();

        $("applicant-profile-content").hidden = true;

        const fields = [
            "detail-college",
            "detail-degree",
            "detail-year-level",
            "detail-bio",
            "detail-skills",
            "detail-qualifications"
        ];

        fields.forEach(id => {
            $(id).textContent = "";
        });

        $("applicant-verification").textContent = "";
        $("applicant-verification").className =
            "applicant-verification";

        $("applicant-profile-message").textContent = "";
        $("applicant-profile-message").className =
            "applicant-profile-message";
    }

    async function showApplicantDetails(application) {
        if (application.status === "withdrawn") {
            notifyApplications(
                "Applicant profile access is restricted after withdrawal.",
                true
            );
            return;
        }

        const requestId = ++applicantProfileRequest;

        previousApplicantFocus = document.activeElement;

        resetApplicantProfile();

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

        const modal = $("applicant-modal");

        modal.classList.add("active");

        $("close-applicant-modal").focus({
            preventScroll: true
        });

        modal.querySelector(".modal").scrollTop = 0;

        const profileMessage = $("applicant-profile-message");

        profileMessage.textContent =
            "Loading student profile...";

        try {
            const result = await api(
                "/company/applications/"
                + application.id
                + "/student-profile"
            );

            if (
                requestId !== applicantProfileRequest ||
                !modal.classList.contains("active")
            ) {
                return;
            }

            if (!result || !result.profile) {
                throw new Error("Invalid applicant profile response.");
            }

            const profile = result.profile;

            $("detail-name").textContent =
                profile.full_name || "Not available";

            $("detail-email").textContent =
                profile.email || "Not available";

            $("detail-position").textContent =
                profile.opportunity_title || "Not available";

            $("detail-status").textContent =
                formatStatus(profile.application_status);

            $("detail-college").textContent =
                profile.college || "Not provided";

            $("detail-degree").textContent =
                profile.degree_program || "Not provided";

            const yearLabels = {
                1: "1st Year",
                2: "2nd Year",
                3: "3rd Year",
                4: "4th Year",
                5: "5th Year",
                6: "6th Year"
            };

            $("detail-year-level").textContent =
                yearLabels[profile.year_level] || "Not provided";

            $("detail-bio").textContent =
                profile.bio || "No introduction provided.";

            $("detail-skills").textContent =
                profile.skills || "No skills provided.";

            $("detail-qualifications").textContent =
                profile.qualifications || "No qualifications provided.";

            const verification = $("applicant-verification");

            verification.textContent = profile.is_verified
                ? "Verified Student"
                : "Awaiting Verification";

            verification.className = profile.is_verified
                ? "applicant-verification verified"
                : "applicant-verification unverified";

            $("applicant-profile-content").hidden = false;

            profileMessage.textContent = "";

            await Promise.all([
                loadApplicantResume(
                    application.id,
                    requestId
                ),
                loadApplicantPicture(
                    application.id,
                    requestId,
                    profile.full_name
                )
            ]);

        } catch (error) {
            if (
                requestId !== applicantProfileRequest ||
                !modal.classList.contains("active")
            ) {
                return;
            }

            $("applicant-profile-content").hidden = true;

            profileMessage.textContent =
                error.message || "Unable to load student profile.";

            profileMessage.className =
                "applicant-profile-message error";
        }
    }

    function closeApplicantDetails() {
        applicantProfileRequest++;

        $("applicant-modal").classList.remove("active");

        resetApplicantProfile();

        if (previousApplicantFocus &&
            previousApplicantFocus.isConnected) {
            previousApplicantFocus.focus();
        }

        previousApplicantFocus = null;
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
                application.status === "withdrawn"
                    ? "Contact information restricted"
                    : application.student_email || "No email"
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

            const applicationId = Number(application.id);

            const allowedTransitions =
                applicationTransitions[application.status] || [];

            if (application.status !== "withdrawn") {
                const viewButton = makeButton(
                    "View Profile",
                    "view-btn",
                    () => showApplicantDetails(application)
                );

                actionContainer.appendChild(viewButton);
            }

            if (!allowedTransitions.length) {
                const locked = addText(
                    actionContainer,
                    "span",
                    application.status === "withdrawn"
                        ? "Withdrawn - Access Restricted"
                        : "Final Status - Locked"
                );

                locked.style.color = "#64748b";
                locked.style.fontSize = "13px";
                locked.style.fontWeight = "600";

            } else {
                const statusControl =
                    document.createElement("div");

                statusControl.className = "status-control";

                const statusSelect =
                    document.createElement("select");

                statusSelect.setAttribute(
                    "aria-label",
                    "Update application status"
                );

                const placeholder =
                    document.createElement("option");

                placeholder.value = "";
                placeholder.textContent = "Select next status";
                placeholder.disabled = true;
                placeholder.selected = true;

                statusSelect.appendChild(placeholder);

                allowedTransitions.forEach(value => {
                    const option =
                        document.createElement("option");

                    option.value = value;
                    option.textContent = formatStatus(value);

                    statusSelect.appendChild(option);
                });

                const saveStatusButton = makeButton(
                    "Save",
                    "primary",
                    async () => {
                        const newStatus = statusSelect.value;

                        if (
                            !allowedTransitions.includes(newStatus) ||
                            updatingApplications.has(applicationId)
                        ) {
                            return;
                        }

                        if (
                            ["accepted", "rejected"].includes(newStatus)
                        ) {
                            const confirmed = window.confirm(
                                "Change this application status to " +
                                formatStatus(newStatus) +
                                "?\\n\\nThis decision is final and cannot be reversed."
                            );

                            if (!confirmed) return;
                        }

                        updatingApplications.add(applicationId);

                        statusSelect.disabled = true;
                        saveStatusButton.disabled = true;
                        saveStatusButton.textContent = "Saving...";

                        try {
                            const result = await api(
                                `/applications/${applicationId}`,
                                {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                        status: newStatus
                                    })
                                }
                            );

                            application.status =
                                result.application.status;

                            try {
                                await loadApplications();

                                notifyApplications(
                                    "Application status updated successfully."
                                );
                            } catch (refreshError) {
                                renderApplications();

                                notifyApplications(
                                    "Status saved. Refresh to retrieve the latest records.",
                                    true
                                );
                            }

                        } catch (error) {
                            try {
                                await loadApplications();
                            } catch (refreshError) {
                                console.error(
                                    "Application refresh error:",
                                    refreshError
                                );
                            }

                            notifyApplications(
                                error.message ||
                                "Unable to update application status.",
                                true
                            );

                        } finally {
                            updatingApplications.delete(applicationId);

                            renderApplications();
                        }
                    }
                );

                statusSelect.disabled =
                    updatingApplications.has(applicationId);

                saveStatusButton.disabled = true;

                if (updatingApplications.has(applicationId)) {
                    saveStatusButton.textContent = "Saving...";
                }

                statusSelect.addEventListener("change", () => {
                    saveStatusButton.disabled =
                        !allowedTransitions.includes(
                            statusSelect.value
                        ) ||
                        updatingApplications.has(applicationId);
                });

                statusControl.append(
                    statusSelect,
                    saveStatusButton
                );

                actionContainer.appendChild(statusControl);
            }

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
