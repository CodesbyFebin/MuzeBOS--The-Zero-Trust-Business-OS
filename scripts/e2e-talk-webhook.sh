set -e
S=e2e-app-secret
MUZEBOS_DB=/tmp/talk-e2e.db META_APP_SECRET=$S PORT=3987 npx next start -p 3987 > /tmp/talk-srv.log 2>&1 &
P=$!; trap "kill $P" EXIT
for i in $(seq 60); do curl -s -o /dev/null localhost:3987/api/talk && break; sleep 1; done
post(){ B="$1"; SIG=$(printf '%s' "$B" | openssl dgst -sha256 -hmac $S | awk '{print $2}'); curl -s -w " %{http_code}\n" -X POST localhost:3987/api/webhooks/whatsapp -H "x-hub-signature-256: sha256=$SIG" -H 'content-type: application/json' --data "$B"; }
TS=$(date +%s)
post "{\"entry\":[{\"changes\":[{\"value\":{\"contacts\":[{\"wa_id\":\"919876543210\",\"profile\":{\"name\":\"Asha\"}}],\"messages\":[{\"id\":\"wamid.E1\",\"from\":\"919876543210\",\"timestamp\":\"$TS\",\"type\":\"text\",\"text\":{\"body\":\"worst service, I want a refund\"}}]}}]}]}"
post "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"id\":\"wamid.E2\",\"from\":\"919876543210\",\"timestamp\":\"$TS\",\"type\":\"text\",\"text\":{\"body\":\"STOP\"}}]}}]}]}"
echo "bad sig:"; curl -s -w " %{http_code}\n" -X POST localhost:3987/api/webhooks/whatsapp -H 'x-hub-signature-256: sha256=00' --data '{}'
echo "anon talk GET:"; curl -s -o /dev/null -w "%{http_code}\n" localhost:3987/api/talk
true
for p in whatsapp handover contacts responders voice; do curl -s -o /dev/null -w "/workspace/talk/$p %{http_code}\n" localhost:3987/workspace/talk/$p; done
