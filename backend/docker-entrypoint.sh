#!/bin/sh
#
# Applies pending migrations, then hands PID 1 to the app.
#
# WHY THIS EXISTS
# Migrations used to be a manual step run from CloudShell after each deploy. Forgetting it ships an
# image whose code expects columns the database does not have, and the failure is not obvious: the
# container starts, the health check passes (it does not touch the database), and the ALB routes
# real traffic to a task that 500s on the first query. Running them here makes a schema mismatch
# impossible by construction — the task cannot come up against a database it has not migrated.
#
# `migrate deploy`, never `migrate dev`: deploy only applies existing migration files and can never
# generate, reset or drop anything. `migrate dev` can offer to reset the database when it detects
# drift, which is not a prompt anything should be able to answer in production.
set -e

echo "[entrypoint] applying database migrations"

# A cold Neon compute can take longer to accept a connection than the schema engine's default
# timeout, and a first-attempt failure there is not a real failure — it is a database waking up.
# Retrying a few times turns that into a slower start instead of a failed deployment.
attempt=1
max_attempts=5

until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] migrations failed after ${max_attempts} attempts — refusing to start"
    # Exit non-zero so ECS marks the task as failed and the circuit breaker rolls the deployment
    # back, rather than leaving a task running against a schema it cannot use.
    exit 1
  fi

  echo "[entrypoint] migrate attempt ${attempt} failed, retrying in 5s"
  attempt=$((attempt + 1))
  sleep 5
done

echo "[entrypoint] migrations applied, starting server"

# exec so node REPLACES this shell as PID 1 and receives SIGTERM directly from ECS. Without it the
# shell would hold PID 1, swallow the signal, and the graceful shutdown in src/index.js would never
# run — in-flight requests would be killed instead of drained.
exec node src/index.js
