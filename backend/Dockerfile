FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home appuser
COPY --chown=appuser:appuser . .
RUN chmod +x entrypoint.sh
USER appuser
EXPOSE 8000
CMD ["sh", "entrypoint.sh"]
