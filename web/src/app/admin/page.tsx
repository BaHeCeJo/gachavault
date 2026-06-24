// Admin panel — requires SuperAdmin or GameAdmin role
// Protected by middleware: src/middleware.ts
export default function AdminPage() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold mb-6">Admin Panel</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdminCard title="Games" description="Add and manage gacha games" href="/admin/games" />
        <AdminCard title="Items" description="Add and edit game items" href="/admin/items" />
        <AdminCard title="Events" description="Banners, version updates, and calendar events" href="/admin/events" />
        <AdminCard title="Users" description="Manage user roles and permissions" href="/admin/users" />
        <AdminCard title="Media" description="Browse and delete uploaded files" href="/admin/media" />
        <AdminCard title="Backups" description="Database backup status and restore instructions" href="/admin/backups" />
        <AdminCard title="Statistics" description="User counts, content totals, and site activity" href="/admin/stats" />
        <AdminCard title="Monitoring" description="Live logs, alert status, and error rates from Loki" href="/admin/monitoring" />
      </div>
    </main>
  );
}

function AdminCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a
      href={href}
      className="block p-6 rounded-lg border border-gray-700 hover:border-white transition"
    >
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-gray-400 text-sm">{description}</p>
    </a>
  );
}
