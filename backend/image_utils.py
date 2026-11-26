import warnings

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


MAX_IMAGE_UPLOAD_SIZE = 2 * 1024 * 1024
MAX_IMAGE_REQUEST_SIZE = 3 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
MAX_IMAGE_DIMENSION = 512
MAX_STORED_IMAGE_SIZE = 2 * 1024 * 1024

ALLOWED_IMAGE_FORMATS = {
    "JPEG",
    "PNG",
    "WEBP"
}

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
}

FORMAT_MIME_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp"
}

FORMAT_EXTENSIONS = {
    "JPEG": {".jpg", ".jpeg"},
    "PNG": {".png"},
    "WEBP": {".webp"}
}


class ImageValidationError(Exception):

    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


def process_image_upload(upload):

    if upload is None or not upload.filename:
        raise ImageValidationError(
            "Please select an image file."
        )

    extension = Path(
        upload.filename
    ).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ImageValidationError(
            "Only JPEG, PNG and WebP images are allowed.",
            415
        )

    raw_data = upload.stream.read(
        MAX_IMAGE_UPLOAD_SIZE + 1
    )

    if not raw_data:
        raise ImageValidationError(
            "The uploaded image is empty."
        )

    if len(raw_data) > MAX_IMAGE_UPLOAD_SIZE:
        raise ImageValidationError(
            "Image size must not exceed 2 MiB.",
            413
        )

    try:
        with warnings.catch_warnings():

            warnings.simplefilter(
                "error",
                Image.DecompressionBombWarning
            )

            with Image.open(BytesIO(raw_data)) as image:

                image_format = image.format

                if image_format not in ALLOWED_IMAGE_FORMATS:
                    raise ImageValidationError(
                        "Unsupported image format.",
                        415
                    )

                if extension not in FORMAT_EXTENSIONS[image_format]:
                    raise ImageValidationError(
                        "File extension does not match image content.",
                        415
                    )

                if upload.mimetype != FORMAT_MIME_TYPES[image_format]:
                    raise ImageValidationError(
                        "Invalid image content type.",
                        415
                    )

                width, height = image.size

                if (
                    width < 1
                    or height < 1
                    or width * height > MAX_IMAGE_PIXELS
                ):
                    raise ImageValidationError(
                        "Image dimensions are too large.",
                        413
                    )

                if getattr(image, "n_frames", 1) != 1:
                    raise ImageValidationError(
                        "Animated images are not allowed."
                    )

                image.verify()

            with Image.open(BytesIO(raw_data)) as image:

                image.load()

                corrected = ImageOps.exif_transpose(image)

                has_transparency = (
                    "A" in corrected.getbands()
                    or "transparency" in corrected.info
                )

                mode = "RGBA" if has_transparency else "RGB"

                converted = corrected.convert(mode)

                converted.thumbnail(
                    (
                        MAX_IMAGE_DIMENSION,
                        MAX_IMAGE_DIMENSION
                    ),
                    Image.Resampling.LANCZOS
                )

                clean_image = Image.new(
                    mode,
                    converted.size
                )

                clean_image.paste(converted)

                output = BytesIO()

                clean_image.save(
                    output,
                    format="WEBP",
                    quality=85,
                    method=4
                )

                image_data = output.getvalue()

                if (
                    not image_data
                    or len(image_data) > MAX_STORED_IMAGE_SIZE
                ):
                    raise ImageValidationError(
                        "Processed image exceeds storage limit.",
                        413
                    )

                return {
                    "mime_type": "image/webp",
                    "file_size": len(image_data),
                    "image_data": image_data,
                    "width": clean_image.width,
                    "height": clean_image.height
                }

    except ImageValidationError:
        raise

    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning
    ):
        raise ImageValidationError(
            "Image dimensions are too large.",
            413
        )

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        EOFError
    ):
        raise ImageValidationError(
            "Invalid or corrupted image file."
        )
