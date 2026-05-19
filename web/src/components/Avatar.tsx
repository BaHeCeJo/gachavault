"use client";

interface AvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ username, avatarUrl, size = 32, className = "" }: AvatarProps) {
  const diceBear = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(username)}&backgroundColor=374151&textColor=e5e7eb&fontSize=38`;
  return (
    <img
      src={avatarUrl ?? diceBear}
      alt={username}
      width={size}
      height={size}
      className={`rounded-full object-cover bg-gray-700 ${className}`}
      onError={(e) => { (e.target as HTMLImageElement).src = diceBear; }}
    />
  );
}
