FROM python:3.12-slim

RUN mkdir /backend_app
WORKDIR /backend_app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /backend_app/entrypoint.sh

CMD ["/backend_app/entrypoint.sh"]
