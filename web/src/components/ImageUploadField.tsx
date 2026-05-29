"use client";

import { useRef, useState } from "react";
import { mediaApi } from "@/lib/api";

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  previewHeight?: string;
}

export default function ImageUploadField({
  label,
  value,
  onChange,
  placeholder = "https://… or upload →",
  previewHeight = "h-16",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("File too large — max 10 MB"); return; }
    setError("");
    setUploading(true);
    try {
      const res = await mediaApi.upload(file);
      onChange(res.data.data?.public_url ?? "");
    } catch {
      setError("Upload failed — please try again");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 rounded-lg border border-gray-700 hover:border-white text-sm transition disabled:opacity-50 whitespace-nowrap"
        >
          {uploading ? "Uploading…" : "Upload file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          aria-hidden="true"
          className={`mt-2 ${previewHeight} rounded object-cover`}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
