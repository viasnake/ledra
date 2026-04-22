# Docker deployment example

This runs Cataloga as a read-only `/api/v1` service backed by a mounted canonical `registry/` data repo.

## Run

```bash
docker compose -f deploy/docker/compose.yaml up --build -d
```

## Check

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/entities
curl http://localhost:8080/api/v1/snapshots
curl "http://localhost:8080/api/v1/query/find-assets?q=vlan"
```

## Stop

```bash
docker compose -f deploy/docker/compose.yaml down
```

The mounted path (`examples/minimal-registry` in this example) is the source-of-truth registry data repository.
Inside the container it is mounted at `/app/registry`, which is the default `CATALOGA_REGISTRY_PATH`.
