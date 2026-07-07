"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { adminApi, collectionsApi, gamesApi, itemsApi } from "@/lib/api";
import { canEdit, isAdmin } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { SafeImage } from "@/components/SafeImage";
import { imageFocus } from "@/lib/imageFocus";

interface Item {
  id: string;
  slug: string;
  game_id: string;
  // game_slug + section_slug are populated by items-service's lookup_slugs
  // and used by /items/[id] to fire game-scoped fetches (schemas, attrs)
  // without first round-tripping through gamesApi.getSection.
  game_slug?: string;
  section_id: string;
  section_slug?: string;
  data: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

interface RelatedItem {
  id: string;
  slug: string;
  data: Record<string, unknown>;
}

interface Skill {
  id: string;
  name: string;
  description: string | null;
  skill_type: string | null;
  data: Record<string, unknown>;
  order: number;
}

interface Build {
  id: string;
  title: string;
  content: Record<string, unknown>;
  created_at: string;
}

interface ChangelogEntry {
  id: string;
  version: string;
  patch: string | null;
  changes: string;
  change_date: string | null;
}

interface SchemaField {
  key: string;
  label: string;
  type: string;
  attribute_type?: string;
}
interface Schema { id: string; section_id: string | null; fields: SchemaField[] }
interface GameAttribute {
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
}

type Tab = "skills" | "builds" | "changelog" | "lore";
const ALL_TABS: Tab[] = ["skills", "builds", "changelog", "lore"];

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [item, setItem] = useState<Item | null>(null);
  const [sectionTabs, setSectionTabs] = useState<Tab[]>(["skills", "changelog"]);
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [attrsByType, setAttrsByType] = useState<Map<string, Map<string, GameAttribute>>>(new Map());
  const [skills, setSkills] = useState<Skill[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [tab, setTab] = useState<Tab>("skills");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inCollection, setInCollection] = useState(false);
  const [collectingSaving, setCollectionSaving] = useState(false);
  const [relatedItems, setRelatedItems] = useState<RelatedItem[]>([]);

  // Lore editing
  const [loreText, setLoreText] = useState("");
  const [editingLore, setEditingLore] = useState(false);

  // Admin add forms
  const [addingSkill, setAddingSkill] = useState(false);
  const [addingBuild, setAddingBuild] = useState(false);
  const [addingChangelog, setAddingChangelog] = useState(false);
  const [skillForm, setSkillForm] = useState({ name: "", description: "", skill_type: "", order: "0" });
  const [buildForm, setBuildForm] = useState({ title: "", content: "" });
  const [clForm, setClForm] = useState({ version: "", patch: "", changes: "", change_date: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const editor = canEdit(user);
  const admin = isAdmin(user);

  useEffect(() => {
    // Fan-out from a single round-trip. The item response from items-service
    // already includes game_slug and section_slug, so we can fire schemas,
    // attributes, related items, AND the section config (for tab list) all
    // in parallel as soon as the item resolves — none of them depend on each
    // other. Previously they ran as: item -> section -> Promise.all([schemas,
    // attrs]), plus a separate useEffect-triggered related-items fetch that
    // had to wait for the React render after setItem(). That was a 3-deep
    // waterfall; this is 1-deep.
    let cancelled = false;
    itemsApi
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const loaded: Item = res.data.data;
        setItem(loaded);

        const gameSlug = loaded.game_slug;

        // Fire-and-render — each promise updates its own slice of state when
        // it lands. Failures fall back to whatever the initial state was
        // (empty list / default tabs) so a flaky downstream doesn't blank
        // the page.
        gamesApi
          .getSection(loaded.section_id)
          .then((r) => {
            if (cancelled) return;
            const section = r.data.data;
            const tabs: string[] = section?.tabs ?? ["skills", "changelog"];
            setSectionTabs(tabs.filter((t): t is Tab => ALL_TABS.includes(t as Tab)));
          })
          .catch(() => {});

        if (gameSlug) {
          Promise.all([
            gamesApi.listSchemas(gameSlug),
            gamesApi.getAttributes(gameSlug),
          ])
            .then(([schemasRes, attrsRes]) => {
              if (cancelled) return;
              const allSchemas: Schema[] = schemasRes.data.data ?? [];
              const sectionSchema = allSchemas.find((s) => s.section_id === loaded.section_id);
              setSchemaFields(sectionSchema?.fields ?? []);
              const attrs: GameAttribute[] = attrsRes.data.data ?? [];
              const map = new Map<string, Map<string, GameAttribute>>();
              for (const a of attrs) {
                if (!map.has(a.attr_type)) map.set(a.attr_type, new Map());
                map.get(a.attr_type)!.set(a.key, a);
              }
              setAttrsByType(map);
            })
            .catch(() => {});
        }

        itemsApi
          .list({ section_id: loaded.section_id, limit: 7 })
          .then((r) => {
            if (cancelled) return;
            setRelatedItems(
              (r.data.data ?? []).filter((i: RelatedItem) => i.id !== id).slice(0, 6),
            );
          })
          .catch(() => {});
      })
      .catch(() => setError("Item not found"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Sync lore text when item loads
  useEffect(() => {
    if (item) setLoreText((item.data?.lore as string) ?? "");
  }, [item]);

  useEffect(() => {
    if (!item) return;
    if (tab === "skills" && skills.length === 0)
      itemsApi.getSkills(id).then((r) => setSkills(r.data.data ?? [])).catch(() => {});
    if (tab === "builds" && builds.length === 0)
      itemsApi.getBuilds(id).then((r) => setBuilds(r.data.data ?? [])).catch(() => {});
    if (tab === "changelog" && changelog.length === 0)
      itemsApi.getChangelog(id).then((r) => setChangelog(r.data.data ?? [])).catch(() => {});
  }, [tab, item, id, skills.length, builds.length, changelog.length]);

  useEffect(() => {
    if (!user || !item) return;
    collectionsApi
      .getByGame(item.game_id)
      .then((r) => {
        const entries: Array<{ item_id: string; owned: boolean }> = r.data.data ?? [];
        setInCollection(entries.some((e) => e.item_id === id && e.owned));
      })
      .catch(() => {});
  }, [user, item, id]);

  const toggleCollection = async () => {
    if (!item) return;
    setCollectionSaving(true);
    try {
      if (inCollection) {
        await collectionsApi.deleteEntry(id);
        setInCollection(false);
      } else {
        await collectionsApi.upsertEntry(id, { game_id: item.game_id, owned: true });
        setInCollection(true);
      }
    } finally {
      setCollectionSaving(false);
    }
  };

  const submitSkill = async () => {
    if (!skillForm.name.trim()) { setSaveError("Name is required"); return; }
    setSaveError(""); setSaving(true);
    try {
      const res = await adminApi.items.createSkill(id, {
        name: skillForm.name,
        description: skillForm.description || null,
        skill_type: skillForm.skill_type || null,
        order: parseInt(skillForm.order) || 0,
      });
      setSkills((p) => [...p, res.data.data].sort((a, b) => a.order - b.order));
      setSkillForm({ name: "", description: "", skill_type: "", order: "0" });
      setAddingSkill(false);
    } catch { setSaveError("Failed to save skill"); }
    finally { setSaving(false); }
  };

  const submitBuild = async () => {
    if (!buildForm.title.trim()) { setSaveError("Title is required"); return; }
    let content: unknown;
    try { content = JSON.parse(buildForm.content || "{}"); }
    catch { setSaveError("Content must be valid JSON"); return; }
    setSaveError(""); setSaving(true);
    try {
      const res = await adminApi.items.createBuild(id, { title: buildForm.title, content });
      setBuilds((p) => [res.data.data, ...p]);
      setBuildForm({ title: "", content: "" });
      setAddingBuild(false);
    } catch { setSaveError("Failed to save build"); }
    finally { setSaving(false); }
  };

  const saveLore = async () => {
    if (!item) return;
    setSaveError(""); setSaving(true);
    try {
      const res = await adminApi.items.update(id, { data: { ...item.data, lore: loreText } });
      setItem(res.data.data);
      setEditingLore(false);
    } catch { setSaveError("Failed to save lore"); }
    finally { setSaving(false); }
  };

  const submitChangelog = async () => {
    if (!clForm.version.trim() || !clForm.changes.trim()) {
      setSaveError("Version and changes are required"); return;
    }
    setSaveError(""); setSaving(true);
    try {
      const res = await adminApi.items.createChangelog(id, {
        version: clForm.version,
        patch: clForm.patch || null,
        changes: clForm.changes,
        change_date: clForm.change_date || null,
      });
      setChangelog((p) => [res.data.data, ...p]);
      setClForm({ version: "", patch: "", changes: "", change_date: "" });
      setAddingChangelog(false);
    } catch { setSaveError("Failed to save changelog entry"); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="h-64 rounded-xl bg-gray-800 animate-pulse" />
      </main>
    );
  }

  if (error || !item) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-red-400">{error || "Item not found"}</p>
        <Link href="/games" className="text-sm text-gray-400 hover:text-white mt-4 inline-block">
          ← Back to games
        </Link>
      </main>
    );
  }

  const name = (item.data?.name as string) ?? item.slug;
  const imageUrl = item.data?.image_url as string | undefined;
  const rarity = item.data?.rarity as string | number | undefined;
  const element = item.data?.element as string | undefined;
  const role = item.data?.role as string | undefined;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex gap-6 mb-8">
        <SafeImage src={imageUrl} alt={name} width={128} height={128} focus={imageFocus(item.data, ["image_url"])} className="w-32 h-32 rounded-xl object-cover flex-shrink-0" fallback={
          <div className="w-32 h-32 rounded-xl bg-gray-800 flex items-center justify-center text-4xl font-semibold text-gray-600 flex-shrink-0">
            {name[0]?.toUpperCase()}
          </div>
        } />
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-semibold">{name}</h1>
            {admin && (
              <Link
                href={`/admin/items`}
                className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition shrink-0"
              >
                Edit in Admin
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {rarity && (
              <span className="px-2 py-1 rounded text-xs bg-yellow-900 text-yellow-300">
                {typeof rarity === "number" ? "★".repeat(rarity) : rarity}
              </span>
            )}
            {element && (
              <span className="px-2 py-1 rounded text-xs bg-blue-900 text-blue-300 capitalize">
                {element}
              </span>
            )}
            {role && (
              <span className="px-2 py-1 rounded text-xs bg-purple-900 text-purple-300 capitalize">
                {role}
              </span>
            )}
          </div>
          {typeof item.data?.description === "string" && item.data.description && (
            <p className="text-gray-400 text-sm mt-3">{item.data.description}</p>
          )}

          {/* Schema-driven attribute badges */}
          {schemaFields.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {schemaFields
                .filter((f) => !["name", "image_url", "description"].includes(f.key))
                .flatMap((field) => {
                  const raw = item.data?.[field.key];
                  if (raw == null || raw === "") return [];

                  if (field.type === "attribute" && field.attribute_type) {
                    const vals = Array.isArray(raw)
                      ? (raw as unknown[]).map((v) => String(v))
                      : [String(raw)];
                    return vals.map((val) => {
                      const attr = attrsByType.get(field.attribute_type!)?.get(val);
                      if (!attr && !val) return null;
                      return (
                        <span
                          key={`${field.key}-${val}`}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                          style={{
                            backgroundColor: `${attr?.color ?? "#555"}28`,
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: `${attr?.color ?? "#555"}60`,
                            color: attr?.color ?? "#ccc",
                          }}
                          title={field.label}
                        >
                          {attr?.icon_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={attr.icon_url} alt={attr.name} className="w-4 h-4 object-contain" />
                          )}
                          {attr ? attr.name : val}
                        </span>
                      );
                    });
                  }

                  const val = String(raw);
                  return [(
                    <span
                      key={field.key}
                      className="px-2.5 py-1 rounded-lg text-xs bg-gray-800 border border-gray-700 text-gray-300"
                      title={field.label}
                    >
                      {field.label}: {val}
                    </span>
                  )];
                })}
            </div>
          )}

          {user && (
            <button
              onClick={toggleCollection}
              disabled={collectingSaving}
              className={`mt-4 px-4 py-2 rounded-lg text-sm transition ${
                inCollection
                  ? "bg-green-900 text-green-300 hover:bg-green-800"
                  : "border border-gray-600 hover:border-white"
              }`}
            >
              {collectingSaving ? "Saving…" : inCollection ? "✓ In Collection" : "+ Add to Collection"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs — only show tabs enabled for this section */}
      <div className="flex gap-2 border-b border-gray-800 mb-6">
        {sectionTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition -mb-px border-b-2 ${
              tab === t ? "border-white text-white" : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Skills tab */}
      {tab === "skills" && (
        <div className="space-y-4">
          {skills.length === 0 && !addingSkill && (
            <p className="text-gray-400">No skills documented yet.</p>
          )}
          {skills.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-semibold">{s.name}</h3>
                {s.skill_type && (
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{s.skill_type}</span>
                )}
              </div>
              {s.description && <p className="text-gray-400 text-sm">{s.description}</p>}
            </div>
          ))}
          {editor && !addingSkill && (
            <button
              onClick={() => { setAddingSkill(true); setSaveError(""); }}
              className="text-sm text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-xl px-4 py-3 w-full transition"
            >
              + Add Skill
            </button>
          )}
          {addingSkill && (
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3">
              <h3 className="font-semibold text-sm">New Skill</h3>
              {[
                { label: "Name *", key: "name" as const, placeholder: "e.g. Normal Attack" },
                { label: "Type", key: "skill_type" as const, placeholder: "e.g. active, passive" },
                { label: "Description", key: "description" as const, placeholder: "Skill description…" },
                { label: "Display order", key: "order" as const, placeholder: "0" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-gray-400 block mb-1">{label}</label>
                  <input
                    type={key === "order" ? "number" : "text"}
                    value={skillForm[key]}
                    onChange={(e) => setSkillForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  />
                </div>
              ))}
              {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
              <div className="flex gap-2">
                <button onClick={submitSkill} disabled={saving} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setAddingSkill(false)} className="px-4 py-2 border border-gray-700 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Builds tab */}
      {tab === "builds" && (
        <div className="space-y-4">
          {builds.length === 0 && !addingBuild && (
            <p className="text-gray-400">No builds yet.</p>
          )}
          {builds.map((b) => (
            <div key={b.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h3 className="font-semibold mb-2">{b.title}</h3>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">
                {typeof b.content === "string" ? b.content : JSON.stringify(b.content, null, 2)}
              </pre>
            </div>
          ))}
          {editor && !addingBuild && (
            <button
              onClick={() => { setAddingBuild(true); setSaveError(""); }}
              className="text-sm text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-xl px-4 py-3 w-full transition"
            >
              + Add Build
            </button>
          )}
          {addingBuild && (
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3">
              <h3 className="font-semibold text-sm">New Build</h3>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Title *</label>
                <input
                  type="text"
                  value={buildForm.title}
                  onChange={(e) => setBuildForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Main DPS Build"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Content (JSON)</label>
                <textarea
                  rows={6}
                  value={buildForm.content}
                  onChange={(e) => setBuildForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder='{"weapons": [], "artifacts": [], "notes": ""}'
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono focus:outline-none focus:border-white resize-none"
                />
              </div>
              {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
              <div className="flex gap-2">
                <button onClick={submitBuild} disabled={saving} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setAddingBuild(false)} className="px-4 py-2 border border-gray-700 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lore tab */}
      {tab === "lore" && (
        <div>
          {!editingLore && (
            <>
              {loreText ? (
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                  <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{loreText}</p>
                </div>
              ) : (
                <p className="text-gray-400">No lore added yet.</p>
              )}
              {editor && (
                <button
                  onClick={() => { setEditingLore(true); setSaveError(""); }}
                  className="mt-4 text-sm text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-xl px-4 py-3 w-full transition"
                >
                  {loreText ? "Edit Lore" : "+ Add Lore"}
                </button>
              )}
            </>
          )}
          {editingLore && (
            <div className="space-y-3">
              <textarea
                rows={12}
                value={loreText}
                onChange={(e) => setLoreText(e.target.value)}
                placeholder="Character lore, backstory, story…"
                className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 text-sm focus:outline-none focus:border-white resize-none leading-relaxed"
              />
              {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
              <div className="flex gap-2">
                <button onClick={saveLore} disabled={saving} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditingLore(false); setLoreText((item?.data?.lore as string) ?? ""); }} className="px-4 py-2 border border-gray-700 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Changelog tab */}
      {tab === "changelog" && (
        <div className="space-y-3">
          {changelog.length === 0 && !addingChangelog && (
            <p className="text-gray-400">No changelog entries.</p>
          )}
          {changelog.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-mono text-sm text-green-400">{c.version}</span>
                {c.patch && <span className="text-xs text-gray-400">{c.patch}</span>}
                {c.change_date && (
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(c.change_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{c.changes}</p>
            </div>
          ))}
          {editor && !addingChangelog && (
            <button
              onClick={() => { setAddingChangelog(true); setSaveError(""); }}
              className="text-sm text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-xl px-4 py-3 w-full transition"
            >
              + Add Entry
            </button>
          )}
          {addingChangelog && (
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3">
              <h3 className="font-semibold text-sm">New Changelog Entry</h3>
              {[
                { label: "Version *", key: "version" as const, placeholder: "e.g. 5.3" },
                { label: "Patch name", key: "patch" as const, placeholder: "e.g. The Phantom Rose" },
                { label: "Release date", key: "change_date" as const, placeholder: "YYYY-MM-DD", type: "date" },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="text-xs text-gray-400 block mb-1">{label}</label>
                  <input
                    type={type ?? "text"}
                    value={clForm[key]}
                    onChange={(e) => setClForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Changes *</label>
                <textarea
                  rows={4}
                  value={clForm.changes}
                  onChange={(e) => setClForm((f) => ({ ...f, changes: e.target.value }))}
                  placeholder="What changed for this character in this version…"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white resize-none"
                />
              </div>
              {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
              <div className="flex gap-2">
                <button onClick={submitChangelog} disabled={saving} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setAddingChangelog(false)} className="px-4 py-2 border border-gray-700 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Related items */}
      {relatedItems.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">More in this section</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {relatedItems.map((r) => {
              const rName = (r.data?.name as string) ?? r.slug;
              const rImage = r.data?.image_url as string | undefined;
              return (
                <Link
                  key={r.id}
                  href={`/items/${r.id}`}
                  className="group flex flex-col rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-600 transition"
                >
                  <div className="relative h-20 w-full">
                    <SafeImage src={rImage} alt={rName} fill focus={imageFocus(r.data, ["image_url"])} className="object-cover" fallback={
                      <div className="h-20 w-full bg-gray-800 flex items-center justify-center text-2xl font-semibold text-gray-600">
                        {rName[0]?.toUpperCase()}
                      </div>
                    } />
                  </div>
                  <p className="px-2 py-1.5 text-xs truncate group-hover:text-white">{rName}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
