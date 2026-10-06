# Build context is the repo root so the image can include knowledge/ (RAG docs) and infra/seed/.
FROM python:3.12-slim
WORKDIR /srv
COPY backend-python/requirements.txt backend-python/requirements.txt
RUN pip install --no-cache-dir -r backend-python/requirements.txt
COPY backend-python/app backend-python/app
COPY knowledge knowledge
COPY infra/seed infra/seed
WORKDIR /srv/backend-python
ENV KNOWLEDGE_DIR=/srv/knowledge INDEX_DIR=/srv/backend-python/data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
