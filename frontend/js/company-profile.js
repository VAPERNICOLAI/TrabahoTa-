document.addEventListener("DOMContentLoaded", () => {
    const API = (
        ["localhost", "127.0.0.1"].includes(
            window.location.hostname
        )
            ? "http://127.0.0.1:5000"
            : ""
    ) + "/api/company/profile/logo";

    const MAX_SIZE = 2 * 1024 * 1024;

    const ALLOWED_TYPES = new Set([
        "image/jpeg",
        "image/png",
        "image/webp"
    ]);

    const $ = id => document.getElementById(id);

    const picture = $("company-profile-logo");
    const initial = $("company-logo-initial");
    const input = $("company-logo-input");
    const choose = $("company-logo-choose");
    const save = $("company-logo-save");
    const remove = $("company-logo-remove");
    const filename = $("company-logo-filename");
    const message = $("company-logo-message");

    if (
        !picture || !initial || !input ||
        !choose || !save || !remove ||
        !filename || !message
    ) {
        return;
    }

    let selectedFile = null;
    let currentImage = null;
    let objectURL = null;
    let busy = false;
    let loaded = false;

    function notify(text, type = "info") {
        message.textContent = text;
        message.className =
            "picture-message " + type;
    }

    function updateButtons() {
        choose.disabled = busy || !loaded;
        input.disabled = busy || !loaded;
        save.disabled = busy || !loaded || !selectedFile;
        remove.disabled = busy || !loaded || !currentImage;
    }

    function clearPreview() {
        if (objectURL) {
            URL.revokeObjectURL(objectURL);
            objectURL = null;
        }

        picture.removeAttribute("src");
        picture.hidden = true;
        initial.hidden = false;
    }

    function showPicture(blob) {
        clearPreview();

        objectURL = URL.createObjectURL(blob);

        picture.src = objectURL;
        picture.hidden = false;
        initial.hidden = true;
    }

    picture.addEventListener("error", () => {
        clearPreview();

        notify(
            "Unable to preview the image.",
            "error"
        );
    });

    async function request(path = "", options = {}) {
        const response = await fetch(API + path, {
            ...options,
            credentials: "include",
            cache: "no-store"
        });

        if (response.status === 401) {
            window.location.replace("login.html");
            throw new Error("Please log in again.");
        }

        if (!response.ok) {
            const result = await response
                .json()
                .catch(() => ({}));

            throw new Error(
                result.error || "Image request failed."
            );
        }

        return response;
    }

    async function refreshPicture() {
        const response = await request();
        const result = await response.json();

        currentImage = result.logo;

        clearPreview();

        if (currentImage) {
            const imageResponse = await request("/view");

            const blob = await imageResponse.blob();

            if (blob.type !== "image/webp") {
                throw new Error(
                    "Invalid company logo response."
                );
            }

            showPicture(blob);
        }

        loaded = true;

        updateButtons();
    }

    function resetSelection() {
        selectedFile = null;
        input.value = "";

        filename.textContent =
            "JPEG, PNG or WebP. Maximum 2 MiB.";

        updateButtons();
    }

    choose.addEventListener("click", () => {
        if (!busy && loaded) {
            input.click();
        }
    });

    input.addEventListener("change", async () => {
        if (busy || !loaded) return;

        const file = input.files[0];

        if (!file) return;

        selectedFile = null;

        const validExtension =
            /\.(jpe?g|png|webp)$/i.test(file.name);

        let error = "";

        if (!validExtension || (
            file.type &&
            !ALLOWED_TYPES.has(file.type)
        )) {
            error =
                "Only JPEG, PNG and WebP images are allowed.";
        } else if (file.size === 0) {
            error = "The selected image is empty.";
        } else if (file.size > MAX_SIZE) {
            error = "Image size must not exceed 2 MiB.";
        }

        if (error) {
            resetSelection();
            busy = true;
            updateButtons();

            try {
                await refreshPicture();
            } catch (refreshError) {
                clearPreview();
            } finally {
                busy = false;
                updateButtons();
            }

            notify(error, "error");
            return;
        }

        selectedFile = file;

        filename.textContent =
            file.name + " — " +
            (file.size / 1024).toFixed(1) + " KB";

        showPicture(file);

        notify(
            "Image selected. Click Save Logo to upload."
        );

        updateButtons();
    });

    save.addEventListener("click", async () => {
        if (busy || !selectedFile) return;

        busy = true;
        updateButtons();

        notify("Uploading company logo...");

        try {
            const form = new FormData();

            form.append(
                "image",
                selectedFile,
                selectedFile.name
            );

            await request("", {
                method: "PUT",
                body: form
            });

            resetSelection();

            await refreshPicture();

            notify(
                "Company logo saved successfully.",
                "success"
            );

        } catch (error) {
            notify(error.message, "error");

        } finally {
            busy = false;
            updateButtons();
        }
    });

    remove.addEventListener("click", async () => {
        if (busy || !currentImage) return;

        if (!window.confirm(
            "Remove your current company logo?"
        )) {
            return;
        }

        busy = true;
        updateButtons();

        notify("Removing company logo...");

        try {
            await request("", {
                method: "DELETE"
            });

            currentImage = null;

            resetSelection();
            clearPreview();

            notify(
                "Company logo removed successfully.",
                "success"
            );

        } catch (error) {
            notify(error.message, "error");

        } finally {
            busy = false;
            updateButtons();
        }
    });

    window.addEventListener("pagehide", () => {
        if (objectURL) {
            URL.revokeObjectURL(objectURL);
            objectURL = null;
        }
    });

    async function loadCompanyProfile() {
        const response = await fetch(
            API.slice(0, -5),
            {
                credentials: "include",
                cache: "no-store"
            }
        );

        if (response.status === 401) {
            window.location.replace("login.html");
            throw new Error("Please log in again.");
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Unable to load company profile."
            );
        }

        const profile = result.profile;

        if (!profile) {
            throw new Error("Invalid company profile response.");
        }

        const companyName =
            profile.company_name || "Company";

        $("company-profile-name").textContent =
            companyName;

        $("company-profile-email").textContent =
            profile.email || "Not available";

        $("company-profile-representative").textContent =
            profile.representative_name || "Not specified";

        $("company-profile-description").textContent =
            profile.description || "No description provided.";

        $("company-profile-created").textContent =
            profile.created_at
                ? String(profile.created_at).split(/[ T]/)[0]
                : "Not available";

        const approval = $("company-profile-approval");

        approval.textContent = profile.is_approved
            ? "Approved Company"
            : "Pending Approval";

        approval.classList.toggle(
            "approved",
            Boolean(profile.is_approved)
        );

        initial.textContent = companyName
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(word => word.charAt(0).toUpperCase())
            .join("") || "CO";

        $("company-profile-message").textContent = "";
    }

    async function initialize() {
        busy = true;
        updateButtons();

        try {
            await loadCompanyProfile();
            await refreshPicture();

        } catch (error) {
            notify(error.message, "error");

            $("company-profile-message").textContent =
                error.message;

            $("company-profile-message").className =
                "picture-message error";

        } finally {
            busy = false;
            updateButtons();
        }
    }

    initialize();
});
