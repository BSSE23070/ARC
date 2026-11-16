"""One error shape for the whole API.

Every failure is returned as::

    {"error": {"code": "OTP_INVALID", "message": "...", "details": {...}}}

``code`` is stable and machine-readable; the app switches on it.
``message`` is safe to show to a user.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("arc.errors")


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        self.headers = headers


class ErrorDetail(BaseModel):
    code: str = Field(description="Stable, machine-readable code, e.g. OTP_INVALID.")
    message: str = Field(description="Safe to show to the user.")
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    """The body of every failed request."""

    error: ErrorDetail


_ERROR_DESCRIPTIONS = {
    400: "The request can't be completed as sent (for example an expired code).",
    401: "Not signed in, or the session has ended.",
    403: "Signed in, but not allowed to do this.",
    404: "Not found.",
    409: "Conflicts with the current state (for example a taken username).",
    410: "This is no longer available.",
    422: "Some of the data sent isn't valid; `details.fields` names the fields.",
    429: "Too many attempts. Wait for the `Retry-After` header's number of seconds.",
    503: "A service this depends on is unavailable. Try again shortly.",
}


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI entries for the errors a route can return, in the real error shape.

    Listing 422 here also replaces FastAPI's default validation-error schema,
    which this API never returns.
    """
    return {
        code: {"model": ErrorResponse, "description": _ERROR_DESCRIPTIONS[code]}
        for code in status_codes
    }


def _body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            _body(exc.code, exc.message, exc.details),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {
                "field": ".".join(str(part) for part in err["loc"] if part != "body"),
                "message": err["msg"],
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            _body(
                "VALIDATION_ERROR",
                "Some of the details you entered aren't valid.",
                {"fields": fields},
            ),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Log the cause for us; never leak internals to the client.
        log.exception("unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse(
            _body("INTERNAL_ERROR", "Something went wrong on our side. Please try again."),
            status_code=500,
        )
