FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .

ENV VONK_API=http://backend:8000
ENV FASTMCP_HOST=0.0.0.0
ENV FASTMCP_PORT=8001

EXPOSE 8001
CMD ["python", "server.py"]
