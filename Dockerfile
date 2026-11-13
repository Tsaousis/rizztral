FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
ENV RIZZTRAL_DB=/tmp/rizztral.db PORT=7860
EXPOSE 7860
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn rizztral.main:app --host 0.0.0.0 --port ${PORT}"]
