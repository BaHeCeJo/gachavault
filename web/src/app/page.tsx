import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">GachaVault</h1>
        <p className="text-xl text-gray-400">The complete gacha game database</p>
        <div className="flex gap-4 justify-center mt-8">
          <Link
            href="/games"
            className="px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition"
          >
            Browse Games
          </Link>
          <Link
            href="/auth/register"
            className="px-6 py-3 border border-white rounded-lg font-semibold hover:bg-white hover:text-black transition"
          >
            Create Account
          </Link>
        </div>
      </div>
    </main>
  );
}
