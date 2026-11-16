FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml constraints.txt ./
COPY arc ./arc
RUN pip install --no-cache-dir . -c constraints.txt

COPY alembic.ini ./
COPY alembic ./alembic

RUN useradd --create-home arc
USER arc

EXPOSE 8000

# Migrations run on start. This is fine for one API container (local, staging);
# with several instances, run "alembic upgrade head" as a separate deploy step.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn --factory arc.main:create_app --host 0.0.0.0 --port 8000 --proxy-headers"]
