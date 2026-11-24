// ========================================
// TRABAHOTA ADMIN DASHBOARD
// ========================================


const API_BASE = (
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
        ? "http://127.0.0.1:5000"
        : ""
) + "/api";


const $ = (id) => document.getElementById(id);


const state = {
    companies: [],
    students: [],
    opportunities: [],
    applications: []
};


const pageTitles = {
    dashboard: "Dashboard Overview",
    companies: "Company Management",
    students: "Student Management",
    opportunities: "Opportunity Monitoring",
    applications: "Application Monitoring"
};


let notificationTimer;
let navigationVersion = 0;
let mutationPending = false;


// ========================================
// API REQUEST HELPER
// ========================================


async function apiRequest(endpoint, options = {}) {
    const response = await fetch(API_BASE + endpoint, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });


    const data = await response.json().catch(() => ({}));


    if (response.status === 401 || response.status === 403) {
        $("admin-app").hidden = true;
        window.location.replace("login.html");
        throw new Error("Unauthorized access.");
    }


    if (!response.ok) {
        throw new Error(
            data.error ||
            data.message ||
            "Request failed (" + response.status + ")"
        );
    }


    return data;
}


// ========================================
// NOTIFICATIONS
// ========================================


function notify(message, type = "success") {
    const notification = $("notification");


    clearTimeout(notificationTimer);


    notification.textContent = message;
    notification.className = type;
    notification.hidden = false;


    notificationTimer = setTimeout(() => {
        notification.hidden = true;
    }, 3000);
}


// ========================================
// SAFE TABLE RENDERING
// ========================================


function createCell(row, value) {
    const cell = document.createElement("td");


    cell.textContent = value ?? "—";


    row.appendChild(cell);
    return cell;
}


function createStatus(row, status) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");


    const normalized = String(status || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");


    badge.className = "status-badge status-" + normalized;


    badge.textContent = normalized
        .charAt(0).toUpperCase() + normalized.slice(1);


    cell.appendChild(badge);
    row.appendChild(cell);
}


function createAction(row, label, style, handler) {
    const cell = document.createElement("td");
    const button = document.createElement("button");


    button.type = "button";
    button.className = style;
    button.textContent = label;


    button.addEventListener("click", async () => {
        if (mutationPending) return;


        button.disabled = true;


        try {
            await handler();
        } finally {
            button.disabled = false;
        }
    });


    cell.appendChild(button);
    row.appendChild(cell);
}


function emptyTable(body, columns, message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");


    cell.colSpan = columns;
    cell.className = "empty-state";
    cell.textContent = message;


    row.appendChild(cell);
    body.appendChild(row);
}


function formatDate(value) {
    if (!value) return "—";


    return String(value).slice(0, 10);
}


function matchesSearch(item, query, fields) {
    const search = query.trim().toLowerCase();


    return fields.some(field =>
        String(item[field] ?? "")
            .toLowerCase()
            .includes(search)
    );
}


// ========================================
// DASHBOARD STATISTICS
// ========================================


async function loadDashboard() {
    const [dashboard, companies] = await Promise.all([
        apiRequest("/admin/dashboard"),
        apiRequest("/admin/companies")
    ]);


    Object.entries(dashboard.statistics).forEach(
        ([key, value]) => {
            const element = $(key);


            if (element) {
                element.textContent = value;
            }
        }
    );


    state.companies = companies.companies;
    renderPendingCompanies();
}


// ========================================
// PENDING COMPANIES
// ========================================


function renderPendingCompanies() {
    const body = $("pending-companies-body");
    body.replaceChildren();


    const pending = state.companies.filter(
        company => !company.is_approved
    );


    if (!pending.length) {
        emptyTable(body, 4, "No pending company approvals.");
        return;
    }


    pending.forEach(company => {
        const row = document.createElement("tr");


        createCell(row, company.company_name);
        createCell(row, company.email);
        createStatus(row, "pending");


        createAction(row, "Approve", "success", () =>
            updateCompanyApproval(company, true)
        );


        body.appendChild(row);
    });
}


// ========================================
// COMPANY MANAGEMENT
// ========================================


async function loadCompanies() {
    const data = await apiRequest("/admin/companies");


    state.companies = data.companies;
    renderCompanies();
}


function renderCompanies() {
    const body = $("companies-body");
    const query = $("company-search").value;


    body.replaceChildren();


    const companies = state.companies.filter(company =>
        matchesSearch(company, query, [
            "id",
            "company_name",
            "full_name",
            "email"
        ])
    );


    if (!companies.length) {
        emptyTable(body, 6, "No companies found.");
        return;
    }


    companies.forEach(company => {
        const row = document.createElement("tr");
        const approved = Boolean(company.is_approved);


        createCell(row, company.id);
        createCell(row, company.company_name);
        createCell(row, company.full_name);
        createCell(row, company.email);


        createStatus(
            row,
            approved ? "approved" : "pending"
        );


        createAction(
            row,
            approved ? "Revoke Approval" : "Approve",
            approved ? "danger" : "success",
            () => updateCompanyApproval(company, !approved)
        );


        body.appendChild(row);
    });
}


async function updateCompanyApproval(company, approved) {
    const action = approved ? "Approve" : "Revoke approval for";


    if (!window.confirm(action + " " + company.company_name + "?")) {
        return;
    }


    mutationPending = true;


    try {
        const data = await apiRequest(
            "/admin/companies/" + company.id + "/approval",
            {
                method: "PATCH",
                body: JSON.stringify({
                    is_approved: approved
                })
            }
        );


        notify(data.message);


        try {
            await loadDashboard();
            renderCompanies();
        } catch (error) {
            notify(
                "Approval saved, but refresh failed. Reload the page.",
                "error"
            );
        }


    } catch (error) {
        notify(error.message, "error");
    } finally {
        mutationPending = false;
    }
}


// ========================================
// STUDENT MANAGEMENT
// ========================================


async function loadStudents() {
    const data = await apiRequest("/admin/students");


    state.students = data.students;
    renderStudents();
}


function renderStudents() {
    const body = $("students-body");
    const query = $("student-search").value;


    body.replaceChildren();


    const students = state.students.filter(student =>
        matchesSearch(student, query, [
            "id",
            "full_name",
            "email"
        ])
    );


    if (!students.length) {
        emptyTable(body, 6, "No students found.");
        return;
    }


    students.forEach(student => {
        const row = document.createElement("tr");
        const verified = Boolean(student.is_verified);


        createCell(row, student.id);
        createCell(row, student.full_name);
        createCell(row, student.email);
        createCell(row, formatDate(student.created_at));


        createStatus(
            row,
            verified ? "verified" : "unverified"
        );


        createAction(
            row,
            verified ? "Revoke Verification" : "Verify",
            verified ? "danger" : "success",
            () => updateStudentVerification(student, !verified)
        );


        body.appendChild(row);
    });
}


async function updateStudentVerification(student, verified) {
    const action = verified
        ? "Verify"
        : "Revoke verification for";


    if (!window.confirm(action + " " + student.full_name + "?")) {
        return;
    }


    mutationPending = true;


    try {
        const data = await apiRequest(
            "/admin/students/" + student.id + "/verification",
            {
                method: "PATCH",
                body: JSON.stringify({
                    is_verified: verified
                })
            }
        );


        notify(data.message);


        try {
            await Promise.all([
                loadStudents(),
                loadDashboard()
            ]);
        } catch (error) {
            notify(
                "Verification saved, but refresh failed. Reload the page.",
                "error"
            );
        }


    } catch (error) {
        notify(error.message, "error");
    } finally {
        mutationPending = false;
    }
}


// ========================================
// OPPORTUNITY MONITORING
// ========================================


async function loadOpportunities() {
    const data = await apiRequest("/admin/opportunities");


    state.opportunities = data.opportunities;
    renderOpportunities();
}


function renderOpportunities() {
    const body = $("opportunities-body");
    const query = $("opportunity-search").value;


    body.replaceChildren();


    const opportunities = state.opportunities.filter(item =>
        matchesSearch(item, query, [
            "id",
            "title",
            "company_name",
            "opportunity_type",
            "location",
            "status"
        ])
    );


    if (!opportunities.length) {
        emptyTable(body, 7, "No opportunities found.");
        return;
    }


    opportunities.forEach(item => {
        const row = document.createElement("tr");


        createCell(row, item.id);
        createCell(row, item.title);
        createCell(row, item.company_name);
        createCell(row, item.opportunity_type);
        createCell(row, item.location);
        createCell(row, formatDate(item.deadline));
        createStatus(row, item.status);


        body.appendChild(row);
    });
}


// ========================================
// APPLICATION MONITORING
// ========================================


async function loadApplications() {
    const data = await apiRequest("/admin/applications");


    state.applications = data.applications;
    renderApplications();
}


function renderApplications() {
    const body = $("applications-body");
    const query = $("application-search").value;


    body.replaceChildren();


    const applications = state.applications.filter(item =>
        matchesSearch(item, query, [
            "id",
            "student_name",
            "student_email",
            "opportunity_title",
            "company_name",
            "status"
        ])
    );


    if (!applications.length) {
        emptyTable(body, 7, "No applications found.");
        return;
    }


    applications.forEach(item => {
        const row = document.createElement("tr");


        createCell(row, item.id);
        createCell(row, item.student_name);
        createCell(row, item.student_email);
        createCell(row, item.opportunity_title);
        createCell(row, item.company_name);
        createCell(row, formatDate(item.applied_at));
        createStatus(row, item.status);


        body.appendChild(row);
    });
}


// ========================================
// SIDEBAR NAVIGATION
// ========================================


async function showPage(page) {
    if (!Object.hasOwn(pageTitles, page)) return;


    const version = ++navigationVersion;


    document.querySelectorAll(".page-section").forEach(
        section => {
            section.hidden = section.id !== (page + "-page");
        }
    );


    document.querySelectorAll(".nav-item").forEach(button => {
        const active = button.dataset.page === page;


        button.classList.toggle("active", active);


        if (active) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });


    $("page-title").textContent = pageTitles[page];


    try {
        switch (page) {
            case "dashboard":
                await loadDashboard();
                break;


            case "companies":
                await loadCompanies();
                break;


            case "students":
                await loadStudents();
                break;


            case "opportunities":
                await loadOpportunities();
                break;


            case "applications":
                await loadApplications();
                break;
        }
    } catch (error) {
        if (version === navigationVersion) {
            notify(error.message, "error");
        }
    }
}


// ========================================
// ADMIN LOGOUT
// ========================================


async function logout() {
    if (!window.confirm("Are you sure you want to logout?")) {
        return;
    }


    const button = $("logout-button");
    button.disabled = true;


    try {
        await apiRequest("/auth/logout", {
            method: "POST"
        });


        window.location.replace("login.html");


    } catch (error) {
        notify(error.message, "error");
        button.disabled = false;
    }
}


// ========================================
// EVENT LISTENERS
// ========================================


function bindEvents() {
    document.querySelectorAll("[data-page]").forEach(button => {
        button.addEventListener("click", () => {
            showPage(button.dataset.page);
        });
    });


    $("company-search").addEventListener(
        "input", renderCompanies
    );


    $("student-search").addEventListener(
        "input", renderStudents
    );


    $("opportunity-search").addEventListener(
        "input", renderOpportunities
    );


    $("application-search").addEventListener(
        "input", renderApplications
    );


    $("logout-button").addEventListener("click", logout);
}


// ========================================
// AUTHENTICATION AND INITIALIZATION
// ========================================


async function initializeAdmin() {
    try {
        const data = await apiRequest("/auth/me");


        if (!data.user || data.user.role !== "admin") {
            window.location.replace("login.html");
            return;
        }


        const name = data.user.full_name || "Administrator";


        $("admin-name").textContent = name;


        document.querySelector(".avatar").textContent =
            name.charAt(0).toUpperCase();


        bindEvents();


        $("loading-screen").hidden = true;
        $("admin-app").hidden = false;


        await showPage("dashboard");


    } catch (error) {
        $("loading-screen").textContent =
            "Unable to access the Administration Portal. " +
            "Please reload or return to the login page.";
    }
}


document.addEventListener("DOMContentLoaded", initializeAdmin);
