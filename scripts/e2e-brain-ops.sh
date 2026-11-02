set -e
MUZEBOS_DB=/tmp/brain-e2e.db npx next start -p 3988 > /tmp/brain-srv.log 2>&1 &
P=$!; trap "kill $P" EXIT
for i in $(seq 60); do curl -s -o /dev/null localhost:3988/api/brain-ops && break; sleep 1; done
echo "anon GET:"; curl -s -o /dev/null -w "%{http_code}\n" localhost:3988/api/brain-ops
echo "anon flow-save:"; curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3988/api/brain-ops -H 'content-type: application/json' --data '{"action":"flow-save","name":"x","spec":{"set":{"var":"a","value":1}}}'
echo "legacy /api/brain still provider status:"; curl -s -o /dev/null -w "%{http_code}\n" localhost:3988/api/brain
for p in brain/models brain/tools brain/security brain/runtime operations/automations; do curl -s -o /dev/null -w "/workspace/$p %{http_code}\n" localhost:3988/workspace/$p; done
