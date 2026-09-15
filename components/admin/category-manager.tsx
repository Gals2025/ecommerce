"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Card } from "@/components/ui";
import { SingleImageField } from "@/components/admin/image-uploader";
import { createCategory, updateCategory, archiveCategory } from "@/actions/catalog";

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  parentName: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  deletedAt: Date | null;
};

export function CategoryManager({ rows, parents }: { rows: CategoryRow[]; parents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState("0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  function startEdit(r: CategoryRow) {
    setEditing(r.id);
    setName(r.name);
    setSlug(r.slug);
    setDescription(r.description ?? "");
    setParentId(r.parentId ?? "");
    setImageUrl(r.imageUrl);
    setSortOrder(String(r.sortOrder));
    setShowNew(true);
  }

  function reset() {
    setEditing(null);
    setName(""); setSlug(""); setDescription(""); setParentId("");
    setImageUrl(null); setSortOrder("0");
    setShowNew(false);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || null,
        parentId: parentId || null,
        imageUrl,
        sortOrder: Number(sortOrder) || 0,
      };
      if (editing) await updateCategory(editing, payload);
      else await createCategory(payload);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function onArchive(id: string, archived: boolean) {
    setPending(true);
    try {
      await archiveCategory(id, archived);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-3">
        {!showNew && <Button onClick={() => { reset(); setShowNew(true); }}>New category</Button>}
      </div>
      {showNew && (
        <Card className="mb-4">
          <h2 className="mb-2 font-semibold">{editing ? "Edit category" : "New category"}</h2>
          <form onSubmit={onSave} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium">Name *<Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label className="text-xs font-medium">Slug (auto if blank)<Input value={slug} onChange={(e) => setSlug(e.target.value)} /></label>
            <label className="text-xs font-medium">Parent (top-level only)
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal">
                <option value="">— Top level —</option>
                {parents.filter((p) => p.id !== editing).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium">Display order<Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" /></label>
            <label className="text-xs font-medium sm:col-span-2">Description<Input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <div className="sm:col-span-2"><SingleImageField kind="categories" label="Category image" value={imageUrl} onChange={setImageUrl} /></div>
            {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save" : "Create"}</Button>
              <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 font-medium">Order</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Parent</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.sortOrder}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-xs">{r.parentName ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.slug}</td>
                <td className="px-3 py-2 text-xs">{r.deletedAt ? "archived" : r.isActive ? "active" : "inactive"}</td>
                <td className="px-3 py-2 text-right text-xs">
                  <button onClick={() => startEdit(r)} className="hover:underline">Edit</button>{" · "}
                  {r.deletedAt
                    ? <button onClick={() => onArchive(r.id, false)} className="hover:underline">Restore</button>
                    : <button onClick={() => onArchive(r.id, true)} className="text-red-600 hover:underline">Archive</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-3 text-sm text-gray-500">No categories yet.</p>}
    </div>
  );
}
