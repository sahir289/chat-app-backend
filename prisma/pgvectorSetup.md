# pgvector Extension Setup

## Problem
Prisma migrations fail because the `pgvector` extension is not available in PostgreSQL. The error message is:
```
ERROR: extension "vector" is not available
```

## Solution

You need to install and enable the `pgvector` extension in your PostgreSQL database.

### Option 1: Enable Extension (if already installed)

If PostgreSQL has pgvector installed but not enabled, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

You can do this by:
1. **Using psql command line:**
   ```bash
   psql -d chatbot_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

2. **Using the SQL file:**
   ```bash
   psql -d chatbot_db -f prisma/enablePgvector.sql
   ```

3. **Using pgAdmin or any PostgreSQL client:**
   - Connect to your database
   - Open Query Tool
   - Run: `CREATE EXTENSION IF NOT EXISTS vector;`

### Option 2: Install pgvector Extension

If the extension is not installed in PostgreSQL, you need to install it first.

#### For Windows:

1. **Download pre-built binaries:**
   - Visit: https://github.com/pgvector/pgvector/releases
   - Download the Windows version matching your PostgreSQL version

2. **Or use Docker (Recommended):**
   ```bash
   docker run -d \
     --name postgres-pgvector \
     -e POSTGRES_PASSWORD=yourpassword \
     -e POSTGRES_DB=chatbot_db \
     -p 5432:5432 \
     pgvector/pgvector:pg16
   ```

3. **Or compile from source:**
   - Requires Visual Studio and PostgreSQL development headers
   - Follow instructions at: https://github.com/pgvector/pgvector#installation

#### For Linux/Mac:

```bash
# Ubuntu/Debian
sudo apt install postgresql-16-pgvector

# macOS (using Homebrew)
brew install pgvector

# Then enable it
psql -d chatbot_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Option 3: Use Cloud PostgreSQL with pgvector

Many cloud providers offer PostgreSQL with pgvector pre-installed:
- **Supabase** - Has pgvector enabled by default
- **Neon** - Supports pgvector
- **AWS RDS** - Can enable pgvector
- **Google Cloud SQL** - Supports pgvector

## Verify Installation

After enabling, verify it works:

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

You should see a row with the vector extension.

## After Enabling

Once the extension is enabled, you can run Prisma migrations:

```bash
npx prisma migrate dev --name your_migration_name
```

## Workaround: Skip Shadow Database Validation

If you cannot install pgvector right now, you can skip shadow database validation:

**Option 1: Use the npm script (recommended):**
```bash
npm run prisma:migrate:skip-shadow -- --name your_migration_name
```

**Option 2: Set environment variable manually (PowerShell):**
```powershell
$env:PRISMA_MIGRATION_SKIP_SHADOW_DATABASE="1"
npx prisma migrate dev --name your_migration_name
```

**Option 3: Set environment variable manually (Command Prompt):**
```cmd
set PRISMA_MIGRATION_SKIP_SHADOW_DATABASE=1
npx prisma migrate dev --name your_migration_name
```

**Note:** Skipping shadow database validation means Prisma won't verify migrations against a clean database. This is safe for development but you should install pgvector before deploying to production.

## Troubleshooting

- **"extension vector does not exist"**: The extension is not installed. Use Option 2.
- **"permission denied"**: You need superuser privileges to create extensions. Connect as a superuser or ask your DBA.
- **"could not open extension control file"**: The extension files are missing. Reinstall PostgreSQL with pgvector support.

