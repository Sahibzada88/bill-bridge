"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/client";
import { HOSTED_UPLOAD_LIMIT, SHRINK_ABOVE } from "@/lib/security/files-constants";
import type { MessageKey } from "@/lib/i18n";

/** Shrinks big JPG/PNG photos in the browser (max 2400 px, JPEG 85%). Falls back to the original on any problem. */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png)$/.test(file.type) || file.size <= SHRINK_ABOVE) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // PNG transparency -> white
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

interface Props {
  requestId: string;
  kind: "bill" | "supporting" | "receipt";
  /** Show the privacy controls that decide what the public preview covers (bills only). */
  showRedaction?: boolean;
  onUploaded?: (id: string) => void;
  label?: string;
}

export function DocumentUpload({ requestId, kind, showRedaction, onUploaded, label }: Props) {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [top, setTop] = useState(true);
  const [bottom, setBottom] = useState(false);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  const [blur, setBlur] = useState(false);

  async function upload() {
    setError(null); setDone(null);
    const picked = fileRef.current?.files?.[0];
    if (!picked) { setError(t("doc.err.no_file")); return; }
    setBusy(true);
    const file = await shrinkImage(picked);
    if (file.size > HOSTED_UPLOAD_LIMIT) { setBusy(false); setError(t("doc.err.file_too_large")); return; }
    const fd = new FormData();
    fd.set("file", file); fd.set("requestId", requestId); fd.set("kind", kind);
    if (showRedaction) {
      fd.set("top", top ? "35" : "0"); fd.set("bottom", bottom ? "20" : "0");
      fd.set("left", left ? "25" : "0"); fd.set("right", right ? "25" : "0"); fd.set("blurAll", String(blur));
    }
    try {
      const res = await fetch("/api/documents", { method: "POST", body: fd, credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; code?: string };
      if (!res.ok || !json.ok || !json.id) {
        const key = `doc.err.${json.code ?? "unknown"}` as MessageKey;
        setError(t(key) !== key ? t(key) : t("common.error"));
        return;
      }
      setDone(t("doc.uploaded"));
      if (fileRef.current) fileRef.current.value = "";
      onUploaded?.(json.id);
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const id = `file-${kind}`;
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-forest-300 bg-forest-50/40 p-4">
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label ?? t(`doc.kind.${kind}`)}</label>
        <input ref={fileRef} id={id} type="file" accept="image/jpeg,image/png,application/pdf"
          className="block w-full text-sm file:me-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-forest-700 file:px-4 file:font-semibold file:text-white hover:file:bg-forest-800" />
        <p className="mt-1 text-sm text-muted">{t("doc.help")}</p>
      </div>
      {showRedaction ? (
        <fieldset className="space-y-2 rounded-md bg-paper p-3">
          <legend className="px-1 text-sm font-semibold">{t("doc.redaction")}</legend>
          <p className="text-sm text-muted">{t("doc.redaction.help")}</p>
          {([["top", top, setTop], ["bottom", bottom, setBottom], ["left", left, setLeft], ["right", right, setRight]] as const).map(([k, v, set]) => (
            <label key={k} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} className="size-4 accent-[#1f4d3a]" />{t(`doc.mask.${k}`)}</label>
          ))}
          <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={blur} onChange={(e) => setBlur(e.target.checked)} className="size-4 accent-[#1f4d3a]" />{t("doc.mask.blur")}</label>
          <p className="text-xs text-muted">{t("doc.pdfNoPreview")}</p>
        </fieldset>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {done ? <Alert variant="success">{done}</Alert> : null}
      <Button type="button" onClick={upload} disabled={busy}><Upload className="size-4" aria-hidden />{busy ? t("common.loading") : t("doc.upload")}</Button>
    </div>
  );
}
