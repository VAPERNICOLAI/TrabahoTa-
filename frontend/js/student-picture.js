document.addEventListener("DOMContentLoaded", () => {
    const API = (
        ["localhost", "127.0.0.1"].includes(
            window.location.hostname
        )
            ? "http://127.0.0.1:5000"
            : ""
    ) + "/api/student/profile/image";

    const MAX_SIZE = 2 * 1024 * 1024;

    const ALLOWED_TYPES = new Set([
        "image/jpeg",
        "image/png",
        "image/webp"
    ]);

    const $ = id => document.getElementById(id);

    const picture = $("student-profile-picture");
    const initial = $("profile-initial");
    const input = $("student-picture-input");
    const choose = $("student-picture-choose");
    const save = $("student-picture-save");
    const remove = $("student-picture-remove");
    const filename = $("student-picture-filename");
    const message = $("student-picture-message");

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

        currentImage = result.image;

        clearPreview();

        if (currentImage) {
            const imageResponse = await request("/view");

            const blob = await imageResponse.blob();

            if (blob.type !== "image/webp") {
                throw new Error(
                    "Invalid profile picture response."
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
            "Image selected. Click Save Picture to upload."
        );

        updateButtons();
    });

    save.addEventListener("click", async () => {
        if (busy || !selectedFile) return;

        busy = true;
        updateButtons();

        notify("Uploading profile picture...");

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
                "Profile picture saved successfully.",
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
            "Remove your current profile picture?"
        )) {
            return;
        }

        busy = true;
        updateButtons();

        notify("Removing profile picture...");

        try {
            await request("", {
                method: "DELETE"
            });

            currentImage = null;

            resetSelection();
            clearPreview();

            notify(
                "Profile picture removed successfully.",
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

    async function initialize() {
        busy = true;
        updateButtons();

        try {
            await refreshPicture();

        } catch (error) {
            notify(error.message, "error");

        } finally {
            busy = false;
            updateButtons();
        }
    }

    initialize();
});
