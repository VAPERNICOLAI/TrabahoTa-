const API_BASE = (["localhost", "127.0.0.1"].includes(window.location.hostname) ? "http://127.0.0.1:5000" : "") + "/api";

document.addEventListener("DOMContentLoaded", async function () {
    const $ = (id) => document.getElementById(id);

    const welcomeMessage = $("welcome-message");
    const opportunityCount = $("opportunity-count");
    const applicationCount = $("application-count");
    const pendingCount = $("pending-count");
    const opportunitiesList = $("opportunities-list");
    const applicationsList = $("applications-list");
    const logoutButton = $("logout-btn");

    let studentApplications = [];
    let availableOpportunities = [];
    let applicationsLoaded = false;

    // =====================================================
    // 1. API REQUESTS
    // =====================================================

    async function api(path, options = {}) {
        const response = await fetch(API_BASE + path, {
            credentials: "include",
            ...options,
            headers: {
                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(options.headers || {})
            }
        });

        if (response.status === 401) {
            window.location.replace("login.html");
            throw new Error("Please log in again.");
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
    // 2. HELPERS
    // =====================================================

    function addText(parent, tag, text) {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.appendChild(element);
        return element;
    }

    function formatDate(value) {
        if (!value) return "Not available";

        const datePart = String(value).split(/[ T]/)[0];
        const parts = datePart.split("-");

        if (parts.length === 3) {
            return `${parts[1]}/${parts[2]}/${parts[0]}`;
        }

        return String(value);
    }

    function formatStatus(status) {
        const labels = {
            submitted: "Submitted",
            pending: "Pending",
            under_review: "Under Review",
            accepted: "Accepted",
            approved: "Approved",
            rejected: "Rejected",
            declined: "Declined"
        };

        return labels[status] || String(status || "Unknown");
    }

    function statusDescription(status) {
        const descriptions = {
            submitted: "Your application has been submitted successfully.",
            pending: "Your application is awaiting review.",
            under_review: "The company is currently reviewing your application.",
            accepted: "Congratulations! The company has accepted your application.",
            approved: "Your application has been approved.",
            rejected: "The company has not selected your application.",
            declined: "The company has declined your application."
        };

        return descriptions[status] || "Application status updated.";
    }

    function createStatusBadge(status) {
        const badge = document.createElement("span");

        badge.textContent = formatStatus(status);
        badge.style.display = "inline-block";
        badge.style.padding = "7px 13px";
        badge.style.borderRadius = "20px";
        badge.style.fontSize = "13px";
        badge.style.fontWeight = "700";

        const colors = {
            submitted: ["#fff3cd", "#856404"],
            pending: ["#fff3cd", "#856404"],
            under_review: ["#dbeafe", "#1d4ed8"],
            accepted: ["#d4edda", "#155724"],
            approved: ["#d4edda", "#155724"],
            rejected: ["#f8d7da", "#721c24"],
            declined: ["#f8d7da", "#721c24"]
        };

        const [background, color] =
            colors[status] || ["#e9ecef", "#495057"];

        badge.style.backgroundColor = background;
        badge.style.color = color;

        return badge;
    }

    // =====================================================
    // 3. VERIFY STUDENT LOGIN
    // =====================================================

    try {
        const result = await api("/auth/me");
        const user = result.user;

        if (!user || user.role !== "student") {
            window.location.replace("login.html");
            return;
        }

        if (welcomeMessage) {
            welcomeMessage.textContent =
                `Welcome, ${user.full_name}!`;
        }

    } catch (error) {
        console.error("Authentication error:", error);
        return;
    }

    // =====================================================
    // 4. APPLICATION HISTORY
    // =====================================================

    function renderApplications() {
        if (!applicationsList) return;

        applicationsList.replaceChildren();

        if (!studentApplications.length) {
            addText(
                applicationsList,
                "p",
                "You have not applied for any opportunities yet."
            );
            return;
        }

        studentApplications.forEach(application => {
            const card = document.createElement("div");
            card.className = "opportunity-card";

            addText(
                card,
                "h3",
                application.title || "Untitled Opportunity"
            );

            addText(
                card,
                "p",
                "Company: " +
                (application.company_name || "Not specified")
            );

            addText(
                card,
                "p",
                "Type: " +
                (application.opportunity_type || "Not specified")
            );

            addText(
                card,
                "p",
                "Location: " +
                (application.location || "Not specified")
            );

            addText(
                card,
                "p",
                "Date Applied: " + formatDate(application.applied_at)
            );

            const statusHeading = addText(
                card,
                "p",
                "Application Status"
            );

            statusHeading.style.fontWeight = "700";
            statusHeading.style.marginBottom = "8px";

            card.appendChild(
                createStatusBadge(application.status)
            );

            const description = addText(
                card,
                "p",
                statusDescription(application.status)
            );

            description.style.marginTop = "12px";
            description.style.color = "#667085";

            applicationsList.appendChild(card);
        });
    }

    async function loadApplications() {
        if (applicationsList) {
            applicationsList.textContent =
                "Loading your applications...";
        }

        try {
            const result = await api("/student/applications");

            if (!Array.isArray(result.applications)) {
                throw new Error("Invalid applications response.");
            }

            studentApplications = result.applications;
            applicationsLoaded = true;

            if (applicationCount) {
                applicationCount.textContent =
                    studentApplications.length;
            }

            if (pendingCount) {
                pendingCount.textContent =
                    studentApplications.filter(application =>
                        ["submitted", "pending", "under_review"]
                            .includes(application.status)
                    ).length;
            }

            renderApplications();
            return true;

        } catch (error) {
            console.error("Applications error:", error);

            applicationsLoaded = false;
            studentApplications = [];

            if (applicationCount) {
                applicationCount.textContent = "—";
            }

            if (pendingCount) {
                pendingCount.textContent = "—";
            }

            if (applicationsList) {
                applicationsList.textContent =
                    "Unable to load your applications. Please refresh.";
            }

            return false;
        }
    }

    // =====================================================
    // 5. REFRESH APPLICATION STATUS
    // =====================================================

    if (applicationsList && applicationsList.parentElement) {
        const refreshButton = document.createElement("button");

        refreshButton.type = "button";
        refreshButton.textContent = "Refresh Application Status";
        refreshButton.className = "primary";
        refreshButton.style.backgroundColor = "#173b70";
        refreshButton.style.color = "#ffffff";
        refreshButton.style.border = "none";
        refreshButton.style.borderRadius = "8px";
        refreshButton.style.padding = "11px 16px";
        refreshButton.style.cursor = "pointer";
        refreshButton.style.marginBottom = "15px";

        applicationsList.parentElement.insertBefore(
            refreshButton,
            applicationsList
        );

        refreshButton.addEventListener("click", async () => {
            refreshButton.disabled = true;
            refreshButton.textContent = "Refreshing...";

            try {
                const success = await loadApplications();

                if (success) {
                    renderOpportunities();
                }
            } finally {
                refreshButton.disabled = false;
                refreshButton.textContent =
                    "Refresh Application Status";
            }
        });
    }

    // =====================================================
    // 6. APPLY NOW BUTTON
    // =====================================================

    function createApplyButton(opportunity) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "apply-btn";

        button.style.padding = "10px 18px";
        button.style.border = "none";
        button.style.borderRadius = "8px";
        button.style.fontWeight = "600";
        button.style.cursor = "pointer";

        const alreadyApplied = studentApplications.some(
            application =>
                Number(application.opportunity_id) ===
                Number(opportunity.id)
        );

        if (!applicationsLoaded) {
            button.textContent = "Applications Unavailable";
            button.disabled = true;
            button.style.backgroundColor = "#6c757d";
            button.style.color = "#ffffff";
            return button;
        }

        if (alreadyApplied) {
            button.textContent = "Already Applied";
            button.disabled = true;
            button.classList.add("applied");
            button.style.backgroundColor = "#198754";
            button.style.color = "#ffffff";
            return button;
        }

        button.textContent = "Apply Now";
        button.style.backgroundColor = "#173b70";
        button.style.color = "#ffffff";

        button.addEventListener("click", async () => {
            const confirmed = window.confirm(
                `Apply for ${opportunity.title}?`
            );

            if (!confirmed) return;

            button.disabled = true;
            button.textContent = "Applying...";

            try {
                await api(
                    `/opportunities/${opportunity.id}/apply`,
                    {
                        method: "POST",
                        body: JSON.stringify({})
                    }
                );

                alert("Application submitted successfully!");

                await loadApplications();
                renderOpportunities();

            } catch (error) {
                console.error("Application error:", error);

                if (error.message.toLowerCase().includes("already")) {
                    await loadApplications();
                    renderOpportunities();
                    return;
                }

                alert(error.message);

                button.disabled = false;
                button.textContent = "Apply Now";
                button.style.backgroundColor = "#173b70";
            }
        });

        return button;
    }

    // =====================================================
    // 7. AVAILABLE OPPORTUNITIES
    // =====================================================

    function renderOpportunities() {
        if (!opportunitiesList) return;

        opportunitiesList.replaceChildren();

        if (!availableOpportunities.length) {
            addText(
                opportunitiesList,
                "p",
                "No opportunities available at the moment."
            );
            return;
        }

        availableOpportunities.forEach(opportunity => {
            const card = document.createElement("div");
            card.className = "opportunity-card";

            addText(
                card,
                "h3",
                opportunity.title || "Untitled Opportunity"
            );

            addText(
                card,
                "p",
                "Company: " +
                (opportunity.company_name || "Not specified")
            );

            addText(
                card,
                "p",
                "Type: " +
                (opportunity.opportunity_type || "Not specified")
            );

            addText(
                card,
                "p",
                "Location: " +
                (opportunity.location || "Not specified")
            );

            addText(
                card,
                "p",
                opportunity.description || ""
            );

            addText(
                card,
                "p",
                "Deadline: " +
                (opportunity.deadline || "Not specified")
            );

            card.appendChild(createApplyButton(opportunity));
            opportunitiesList.appendChild(card);
        });
    }

    async function loadOpportunities() {
        if (!opportunitiesList) return;

        opportunitiesList.textContent =
            "Loading opportunities...";

        try {
            const result = await api("/opportunities");

            const opportunities = Array.isArray(result)
                ? result
                : result.opportunities;

            if (!Array.isArray(opportunities)) {
                throw new Error("Invalid opportunities response.");
            }

            availableOpportunities = opportunities;

            if (opportunityCount) {
                opportunityCount.textContent =
                    availableOpportunities.length;
            }

            renderOpportunities();

        } catch (error) {
            console.error("Opportunities error:", error);

            if (opportunityCount) {
                opportunityCount.textContent = "—";
            }

            opportunitiesList.textContent =
                "Unable to load opportunities.";
        }
    }

    // =====================================================
    // 8. LOGOUT
    // =====================================================

    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            logoutButton.disabled = true;
            logoutButton.textContent = "Logging out...";

            try {
                await api("/auth/logout", {
                    method: "POST"
                });

                window.location.replace("login.html");

            } catch (error) {
                console.error("Logout error:", error);
                alert("Unable to log out. Please try again.");

                logoutButton.disabled = false;
                logoutButton.textContent = "Logout";
            }
        });
    }

    // =====================================================
    // 9. INITIALIZE STUDENT DASHBOARD
    // =====================================================

    await loadApplications();
    await loadOpportunities();
});