// =====================================================
// TRABAHOTA! STUDENT RESUME MANAGEMENT
// =====================================================

document.addEventListener("DOMContentLoaded", function () {

    const RESUME_API_BASE = (
        ["localhost", "127.0.0.1"].includes(
            window.location.hostname
        )
            ? "http://127.0.0.1:5000"
            : ""
    ) + "/api";

    const MAX_FILE_SIZE = 2 * 1024 * 1024;

    const $ = id => document.getElementById(id);

    const panel = $("student-resume-panel");

    if (!panel) return;

    const form = $("student-resume-form");
    const fileInput = $("resume-file-input");
    const chooseButton = $("resume-choose-btn");
    const uploadButton = $("resume-upload-btn");
    const selectedFile = $("resume-selected-file");

    const currentCard = $("resume-current-card");
    const emptyState = $("resume-empty-state");
    const fileName = $("resume-file-name");
    const fileSize = $("resume-file-size");
    const updatedAt = $("resume-updated-at");

    const downloadButton = $("resume-download-btn");
    const replaceButton = $("resume-replace-btn");
    const deleteButton = $("resume-delete-btn");
    const message = $("resume-message");

    let currentResume = null;
    let busy = false;
    let loaded = false;

    // =====================================================
    // API REQUEST HELPER
    // =====================================================

    async function resumeRequest(path, options = {}) {

        const response = await fetch(
            RESUME_API_BASE + path,
            {
                ...options,
                credentials: "include",
                cache: "no-store"
            }
        );

        if (response.status === 401) {
            window.location.replace("login.html");
            throw new Error("Please log in again.");
        }

        if (!response.ok) {

            const result = await response.json()
                .catch(() => null);

            throw new Error(
                result?.error || "Resume request failed."
            );
        }

        return response;
    }

    // =====================================================
    // UI HELPERS
    // =====================================================

    function showResumeMessage(text = "", type = "") {
        message.textContent = text;
        message.className = "resume-message";

        if (type) {
            message.classList.add(type);
        }
    }

    function formatFileSize(bytes) {

        if (bytes < 1024) {
            return `${bytes} bytes`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatResumeDate(value) {

        if (!value) return "Not available";

        const parts = String(value)
            .split(/[ T]/)[0]
            .split("-");

        if (parts.length === 3) {
            return `${parts[1]}/${parts[2]}/${parts[0]}`;
        }

        return String(value);
    }

    function validateResumeFile(file) {

        if (!file) {
            return "Please select a PDF file.";
        }

        if (!file.name.toLowerCase().endsWith(".pdf")) {
            return "Only PDF files are allowed.";
        }

        if (file.type && file.type !== "application/pdf") {
            return "Invalid PDF file type.";
        }

        if (file.size === 0) {
            return "The selected file is empty.";
        }

        if (file.size > MAX_FILE_SIZE) {
            return "Your resume must not exceed 2 MB.";
        }

        return null;
    }

    function setResumeBusy(value) {

        busy = value;

        chooseButton.disabled = busy || !loaded;
        fileInput.disabled = busy || !loaded;

        uploadButton.disabled =
            busy ||
            !loaded ||
            Boolean(validateResumeFile(fileInput.files[0]));

        downloadButton.disabled =
            busy || !loaded || !currentResume;

        replaceButton.disabled =
            busy || !loaded || !currentResume;

        deleteButton.disabled =
            busy || !loaded || !currentResume;
    }

    function clearSelection() {

        fileInput.value = "";
        selectedFile.textContent = "No file selected";
        setResumeBusy(busy);
    }

    function renderResume(resume) {

        currentResume = resume || null;

        currentCard.hidden = !currentResume;
        emptyState.hidden = Boolean(currentResume);

        if (currentResume) {

            fileName.textContent = currentResume.file_name;

            fileSize.textContent =
                formatFileSize(currentResume.file_size)
                + " · PDF document";

            updatedAt.textContent =
                "Updated: " +
                formatResumeDate(currentResume.updated_at);

            uploadButton.textContent = "Replace Résumé";

        } else {

            fileName.textContent = "—";
            fileSize.textContent = "—";
            updatedAt.textContent = "—";

            uploadButton.textContent = "Upload Résumé";
        }

        setResumeBusy(busy);
    }

    // =====================================================
    // LOAD RESUME METADATA
    // =====================================================

    async function loadResume() {

        loaded = false;
        setResumeBusy(true);

        currentCard.hidden = true;
        emptyState.hidden = true;

        showResumeMessage("Loading your résumé...", "info");

        try {

            const response = await resumeRequest(
                "/student/resume"
            );

            const result = await response.json();

            loaded = true;
            renderResume(result.resume);
            showResumeMessage();

        } catch (error) {

            showResumeMessage(
                error.message || "Unable to load résumé.",
                "error"
            );

        } finally {

            setResumeBusy(false);
        }
    }

    // =====================================================
    // UPLOAD OR REPLACE RESUME
    // =====================================================

    async function uploadResume(event) {

        event.preventDefault();

        if (busy || !loaded) return;

        const file = fileInput.files[0];
        const validationError = validateResumeFile(file);

        if (validationError) {
            showResumeMessage(validationError, "error");
            return;
        }

        if (
            currentResume &&
            !window.confirm(
                "Replace your existing résumé with this PDF?"
            )
        ) {
            return;
        }

        const formData = new FormData();

        formData.append("resume", file);

        setResumeBusy(true);

        uploadButton.textContent = "Uploading...";

        showResumeMessage(
            "Uploading your résumé...",
            "info"
        );

        try {

            const response = await resumeRequest(
                "/student/resume",
                {
                    method: "PUT",
                    body: formData
                }
            );

            const result = await response.json();

            renderResume(result.resume);
            clearSelection();

            showResumeMessage(
                "Your résumé has been saved successfully!",
                "success"
            );

        } catch (error) {

            showResumeMessage(
                error.message || "Unable to upload résumé.",
                "error"
            );

        } finally {

            uploadButton.textContent = currentResume
                ? "Replace Résumé"
                : "Upload Résumé";

            setResumeBusy(false);
        }
    }

    // =====================================================
    // DOWNLOAD RESUME
    // =====================================================

    async function downloadResume() {

        if (busy || !currentResume || !loaded) return;

        setResumeBusy(true);

        showResumeMessage(
            "Preparing your download...",
            "info"
        );

        try {

            const response = await resumeRequest(
                "/student/resume/download"
            );

            const blob = await response.blob();

            if (blob.type !== "application/pdf") {
                throw new Error("Invalid download response.");
            }

            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");

            anchor.href = url;
            anchor.download = currentResume.file_name;

            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            setTimeout(
                () => URL.revokeObjectURL(url),
                10000
            );

            showResumeMessage(
                "Your résumé download has started.",
                "success"
            );

        } catch (error) {

            showResumeMessage(
                error.message || "Unable to download résumé.",
                "error"
            );

        } finally {

            setResumeBusy(false);
        }
    }

    // =====================================================
    // DELETE RESUME
    // =====================================================

    async function deleteResume() {

        if (busy || !currentResume || !loaded) return;

        const confirmed = window.confirm(
            "Remove your résumé? Companies will no longer " +
            "be able to download it through TrabahoTa."
        );

        if (!confirmed) return;

        setResumeBusy(true);

        showResumeMessage(
            "Removing your résumé...",
            "info"
        );

        try {

            await resumeRequest(
                "/student/resume",
                { method: "DELETE" }
            );

            renderResume(null);
            clearSelection();

            showResumeMessage(
                "Your résumé has been removed successfully.",
                "success"
            );

        } catch (error) {

            showResumeMessage(
                error.message || "Unable to remove résumé.",
                "error"
            );

        } finally {

            setResumeBusy(false);
        }
    }

    // =====================================================
    // EVENT LISTENERS
    // =====================================================

    chooseButton.addEventListener("click", function () {

        if (!busy && loaded) {
            fileInput.click();
        }
    });

    replaceButton.addEventListener("click", function () {

        if (!busy && loaded) {
            fileInput.click();
        }
    });

    fileInput.addEventListener("change", function () {

        const file = fileInput.files[0];

        if (!file) {
            clearSelection();
            showResumeMessage();
            return;
        }

        const error = validateResumeFile(file);

        if (error) {

            clearSelection();
            showResumeMessage(error, "error");

            return;
        }

        selectedFile.textContent =
            file.name + " · " + formatFileSize(file.size);

        showResumeMessage();
        setResumeBusy(false);
    });

    form.addEventListener("submit", uploadResume);
    downloadButton.addEventListener("click", downloadResume);
    deleteButton.addEventListener("click", deleteResume);

    // INITIALIZE

    loadResume();

});
