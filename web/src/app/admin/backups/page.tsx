import Link from "next/link";

const CMD = (cmd: string) => (
  <code className="block bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm font-mono text-green-400 whitespace-pre-wrap select-all">
    {cmd}
  </code>
);

export default function AdminBackupsPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-white">Admin</Link>
        <span>/</span>
        <span className="text-white">Backups</span>
      </div>

      <h1 className="text-3xl font-semibold mb-2">Database Backups</h1>
      <p className="text-gray-400 mb-8">
        The <code className="text-gray-300">db-backup</code> container runs{" "}
        <code className="text-gray-300">pg_dump</code> automatically every 24 hours.
        Backups are stored in the <code className="text-gray-300">db_backups</code> Docker
        volume and pruned after 7 days (14 days in production).
      </p>

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold mb-3">List backups</h2>
          {CMD("docker exec gachawiki-db-backup-1 ls -lh /backups")}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Trigger a backup now</h2>
          {CMD(
            "docker exec gachawiki-db-backup-1 sh -c \\\n" +
            '  \'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \\\n' +
            "    -h postgres -U gachavault --clean --if-exists gachavault \\\n" +
            "    | gzip > /backups/manual_$(date +%Y%m%d_%H%M%S).sql.gz'"
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Copy a backup to your machine</h2>
          {CMD(
            "# Find the volume mount path\n" +
            "docker volume inspect gachawiki_db_backups\n\n" +
            "# Or copy via docker cp (pick the filename from the list above)\n" +
            "docker cp gachawiki-db-backup-1:/backups/gachavault_YYYYMMDD_HHMMSS.sql.gz ."
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Restore from a backup</h2>
          <p className="text-gray-400 text-sm mb-2">
            Run on the server (or locally). This will drop and recreate all tables.
          </p>
          {CMD(
            "# Decompress and pipe into psql\n" +
            "gunzip -c gachavault_YYYYMMDD_HHMMSS.sql.gz | \\\n" +
            "  docker exec -i gachawiki-postgres-1 \\\n" +
            "  psql -U gachavault gachavault"
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">View backup container logs</h2>
          {CMD("docker logs --tail 50 gachawiki-db-backup-1")}
        </section>

        <div className="rounded-xl border border-yellow-800 bg-yellow-950/30 px-5 py-4 text-sm text-yellow-300">
          <strong>Production note:</strong> The backup volume is local to the VPS. For
          off-site durability, consider periodically rsyncing{" "}
          <code>/var/lib/docker/volumes/gachawiki_db_backups/_data</code> to an S3
          bucket or remote server.
        </div>
      </div>
    </main>
  );
}
