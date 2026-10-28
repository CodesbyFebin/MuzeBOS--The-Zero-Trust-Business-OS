#!/usr/bin/env bash
# Curl e2e for /api/data against a real production build. Anonymous access must be refused.
set -e
MUZEBOS_DB=/tmp/data-e2e.db npx next start -p 3989 > /tmp/data-srv.log 2>&1 &
P=$!; trap "kill $P" EXIT
for i in $(seq 60); do curl -s -o /dev/null localhost:3989/api/data && break; sleep 1; done
echo "anon GET:"; curl -s -o /dev/null -w "%{http_code}\n" localhost:3989/api/data
echo "anon select:"; curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3989/api/data -H 'content-type: application/json' --data '{"action":"select","sql":"SELECT * FROM mb_customers"}'
echo "anon redact:"; curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3989/api/data -H 'content-type: application/json' --data '{"action":"redact","customerId":"x","confirm":"x"}'
for p in growth/analytics money/pipeline foundation/policies; do curl -s -o /dev/null -w "/workspace/$p %{http_code}\n" localhost:3989/workspace/$p; done
