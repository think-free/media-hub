# MediaHub (starter)

A simple, fast media indexer/streamer designed to avoid filesystem access during UI browsing:
- Indexer scans roots and stores items in PostgreSQL
- UI lists/searches from DB only
- Filesystem is used only for streaming and background jobs (thumb/metadata placeholder)

## Stack
- Backend: Go + chi + pgx + JWT auth
- DB: PostgreSQL
- Frontend: React + Vite (TypeScript)
- Docker Compose for local dev

## Quick start (dev)
```bash
cd mediahub
docker compose up --build
```

Then open:
- Frontend: http://localhost:5173
- Backend: http://localhost:8080

### Default user
- username: admin
- password: admin

### Create libraries
Use the API (requires login token) or insert into DB directly.
Example SQL:
```sql
insert into library(name, roots) values ('Home', ARRAY['/media/disk1','/media/disk2']);
```

Then trigger a scan:
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" "http://localhost:8080/api/scan?library_id=1"
```
