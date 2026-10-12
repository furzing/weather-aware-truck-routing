FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY scripts/serve.py ./backend/serve.py
COPY --from=frontend /build/dist ./frontend/dist
RUN python backend/manage.py collectstatic --noinput && useradd --uid 10001 --create-home appuser
USER appuser
WORKDIR /app/backend
EXPOSE 8000
CMD ["python", "serve.py"]
