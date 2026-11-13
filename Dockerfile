# Single container: builds the React UI and serves it from FastAPI.
# Works as a Hugging Face Docker Space (port 7860) or anywhere else.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=web /web/dist ./frontend/dist
ENV RIZZTRAL_STATIC=/app/frontend/dist RIZZTRAL_DB=/tmp/rizztral.db PORT=7860
EXPOSE 7860
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn rizztral.main:app --host 0.0.0.0 --port ${PORT}"]
