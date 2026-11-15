FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py index.html app.js recorder.js ./
ENV HOST=0.0.0.0 PORT=8767 VOICE_DATA_DIR=/data
EXPOSE 8767
VOLUME ["/data"]
CMD ["python", "app.py"]
