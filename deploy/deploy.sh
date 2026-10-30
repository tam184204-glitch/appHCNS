#!/bin/bash
# Chạy trên máy này từ thư mục app-hcns: bash deploy/deploy.sh
# data/ có dữ liệu nhân sự thật: chỉ chép lên VPS qua SSH, không đưa lên git.
set -euo pipefail
export MSYS_NO_PATHCONV=1
HOST=root@169.58.250.130
SSH="ssh -i $HOME/.ssh/ume_vps -o IdentitiesOnly=yes"
tar --exclude=node_modules --exclude=.git --exclude=.env --exclude='*.log' -czf - . \
  | $SSH $HOST 'mkdir -p /opt/hcns/src /opt/hcns/pgdata && tar -xzf - -C /opt/hcns/src && sed -i "s/\r$//" /opt/hcns/src/deploy/server-setup.sh && bash /opt/hcns/src/deploy/server-setup.sh'
