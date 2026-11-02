#!/usr/bin/env bash
# Curl e2e for /api/voice (typed-text fallback) against a real production build and a fresh SQLite DB.
set -e
DB=/tmp/voice-e2e-$$.db; J=/tmp/voice-e2e-$$.jar; PORT=3987
MUZEBOS_DB=$DB npx next start -p $PORT > /tmp/voice-srv.log 2>&1 &
P=$!; trap "kill $P; fuser -k $PORT/tcp >/dev/null 2>&1; rm -f $DB $J" EXIT
for i in $(seq 60); do curl -s -o /dev/null localhost:$PORT/api/voice && break; sleep 1; done
post() { curl -s -b $J -c $J -X POST localhost:$PORT/api/voice -H 'content-type: application/json' -H "origin: http://localhost:$PORT" --data "$1"; }
echo "anon voice: $(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:$PORT/api/voice -H 'content-type: application/json' -H "origin: http://localhost:$PORT" --data '{"text":"status"}')"
curl -s -c $J -X POST localhost:$PORT/api/metabos/auth -H 'content-type: application/json' -H "origin: http://localhost:$PORT" --data '{"action":"setup","setup":{"workspace":"E2E Bakery","name":"Owner","email":"owner@example.com","password":"e2e-only-Passw0rd!"}}' -o /dev/null -w "setup: %{http_code}\n"
echo "status:  $(post '{"text":"what is the status"}')"
echo "create:  $(post '{"text":"create a task to call the flour supplier"}')"
echo "approve: $(post '{"text":"approve it"}')"
echo "tasks:   $(post '{"text":"list tasks"}')"
echo "status2: $(post '{"text":"what is the status"}')"
echo "page:    $(curl -s -b $J -o /dev/null -w '%{http_code}' localhost:$PORT/)"
echo "voice-card markup on /: $(curl -s -b $J localhost:$PORT/ | grep -c 'mb-voice')"
