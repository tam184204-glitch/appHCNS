#!/bin/bash
# Chạy trên VPS sau khi deploy.sh đã chép mã nguồn vào /opt/hcns/src. Chỉ thêm, không sửa hệ thống khác.
set -euo pipefail
DOMAIN=hcns.169-58-250-130.sslip.io
CONF=/opt/ctg/nginx/conf.d/$DOMAIN.conf
cd /opt/hcns
cp src/deploy/docker-compose.yml .

# Mật khẩu ngẫu nhiên, chỉ tạo lần đầu. Không có NO_LOGIN: bắt buộc đăng nhập.
if [ ! -f .env ]; then
  umask 077
  printf 'DB_PASSWORD=%s\nDEFAULT_PW=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -base64 12 | tr -d '/+=')" > .env
fi
docker compose up -d --build
docker compose run --rm hcns_app node server/seed.js

check_nginx() {
  local binds
  binds=$(docker inspect ctg_nginx --format '{{range .Mounts}}-v {{.Source}}:{{.Destination}} {{end}}')
  docker run --rm $binds --network ctg_net --add-host=host.docker.internal:host-gateway nginx:1.25-alpine nginx -t
}
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  cat > "$CONF" <<EOF
server { listen 80; server_name $DOMAIN; location /.well-known/acme-challenge/ { root /opt/ctg/nginx/acme; } location / { return 503; } }
EOF
  check_nginx && docker kill -s HUP ctg_nginx
  certbot certonly --webroot -w /opt/ctg/nginx/acme -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
fi
cat > "$CONF" <<EOF
server { listen 80; server_name $DOMAIN; location /.well-known/acme-challenge/ { root /opt/ctg/nginx/acme; } location / { return 301 https://\$host\$request_uri; } }
server {
  listen 443 ssl; server_name $DOMAIN;
  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  client_max_body_size 60m;
  location / { proxy_pass http://hcns_app:3600; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https; }
}
EOF
check_nginx && docker kill -s HUP ctg_nginx
echo "Xong: https://$DOMAIN"
