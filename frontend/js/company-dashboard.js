
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

    let opportunities = [];
    let editingId = null;
    let authenticated = false;

    function notify(text, error = false) {
        message.textContent = text;
        message.className = error ? "message error" : "message success-text";
    }

    async function api(path, options = {}) {
        const response = await fetch(COMPANY_API + path, {
            credentials: "include",
            ...options,
            headers: {
                "Content-Type": "application/json",
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
            throw new Error(result?.error || "Request failed.");
        }

        return result;
    }

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

    function renderPostings() {
        list.replaceChildren();

        $("postings-count").textContent = opportunities.length;
        $("active-count").textContent = opportunities.filter(
            (item) => item.status === "open" &&
                (!item.deadline || item.deadline >= new Date().toLocaleDateString("en-CA"))
        ).length;

        // The applications API does not exist yet.
        $("applications-count").textContent = "—";

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
                                    body: JSON.stringify({ status: "closed" })
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

            // The backend does not allow reopening closed postings.
            if (opportunity.status === "closed") {
                $("job-status").value = "closed";
                $("job-status").disabled = true;
            } else {
                $("job-status").disabled = false;
            }
        } else {
            $("job-status").disabled = false;
        }

        formPanel.classList.remove("hidden");
        formPanel.scrollIntoView({ behavior: "smooth" });
    }

    function closeForm() {
        editingId = null;
        form.reset();
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

    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;

        try {
            await api("/auth/logout", { method: "POST" });
            window.location.replace("login.html");
        } catch (error) {
            notify(error.message, true);
            logoutButton.disabled = false;
        }
    });

    // Verify identity before loading private company data.
    try {
        const result = await api("/auth/me");

        if (!result.user || result.user.role !== "company") {
            window.location.replace("login.html");
            return;
        }

        await api("/company/dashboard");

        authenticated = true;
        welcome.textContent = `Welcome, ${result.user.full_name}!`;
        createButton.disabled = false;

        await loadPostings();
    } catch (error) {
        notify(error.message, true);
        list.textContent = "Unable to load company opportunities.";
    }
});
