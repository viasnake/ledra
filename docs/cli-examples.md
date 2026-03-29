# CLI examples

Build first:

```bash
mise install
npm install
npm run build
```

Use the CLI via workspace bin:

```bash
npm exec --workspace @cataloga/cli cataloga -- --help
```

Examples below assume `cataloga.yaml` at repository root.

## Source management

```bash
npm exec --workspace @cataloga/cli cataloga -- source list --config cataloga.yaml
npm exec --workspace @cataloga/cli cataloga -- source add --config cataloga.yaml --id manual-extra --type manual --scope manual-extra --sourceConfig '{"records":[{"id":"svc-extra","type":"service","name":"svc-extra"}]}'
```

## Ingest

```bash
npm exec --workspace @cataloga/cli cataloga -- ingest run --config cataloga.yaml
npm exec --workspace @cataloga/cli cataloga -- ingest run --config cataloga.yaml --source aws-prod
```

## Snapshots

```bash
npm exec --workspace @cataloga/cli cataloga -- snapshot list --config cataloga.yaml
```

## Topology

```bash
npm exec --workspace @cataloga/cli cataloga -- topology build --config cataloga.yaml
npm exec --workspace @cataloga/cli cataloga -- topology export --config cataloga.yaml --id snp_effective_global_20260329211658135_site-overview_json --out ./dist/topology.json
```

## Drift

```bash
npm exec --workspace @cataloga/cli cataloga -- drift compute --config cataloga.yaml
```

## API server

```bash
npm exec --workspace @cataloga/cli cataloga -- serve --config cataloga.yaml --port 3000
```
