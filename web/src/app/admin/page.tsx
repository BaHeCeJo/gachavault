// Admin panel — requires SuperAdmin or GameAdmin role
// Protected by middleware: src/middleware.ts
export default function AdminPage() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdminCard title="Games" description="Add and manage gacha games" href="/admin/games" />
        <AdminCard title="Items" description="Add and edit game items" href="/admin/items" />
        <AdminCard title="Users" description="Manage user roles and permissions" href="/admin/users" />
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
