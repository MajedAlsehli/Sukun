"use client";

/**
 * H8 · Step 1 — Upload. Camera, gallery, and drag-and-drop, side by side in
 * an asymmetric split rather than the old stacked 488px card.
 *
 * Real `File` objects with `URL.createObjectURL` previews: the analysis
 * screen and the result card both show the resident's actual photo, and the
 * same `File[]` is what the live `POST /ai/defect-analysis` will multipart.
 * Object URLs are revoked by the owning screen, which holds the array.
 */

import { useRef, useState, type DragEvent } from "react";
import { AiChip, brandButton } from "@/components/brand/SukunBrand";
import { CameraIcon, CloseIcon, GalleryIcon, UploadCloudIcon, AlertIcon } from "@/components/brand/Icons";

export interface Shot {
  id: string;
  file: File;
  url: string;
}

const MAX_SHOTS = 10;
const MAX_BYTES = 12 * 1024 * 1024;

export function UploadStep({
  shots,
  onAdd,
  onRemove,
  onAnalyze,
}: {
  shots: Shot[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onAnalyze: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setError("الملف الذي اخترته ليس صورة. نقبل صيغ JPG وPNG وHEIC.");
      return;
    }
    const tooBig = images.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`حجم «${tooBig.name}» يتجاوز ١٢ ميجابايت. جرّب صورة أصغر.`);
      return;
    }
    const room = MAX_SHOTS - shots.length;
    if (room <= 0) {
      setError(`وصلت إلى الحد الأقصى (${MAX_SHOTS} صور).`);
      return;
    }
    setError(null);
    onAdd(images.slice(0, room));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files);
  }

  return (
    <div style={{ display: "grid", gap: 30, gridTemplateColumns: "minmax(0,1fr)" }} className="sk-report-split">
      {/* ---------------------------------------------------------- intro */}
      <div style={{ maxWidth: "46ch" }}>
        <AiChip label="بلاغ ذكي" />
        <h1
          style={{
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 700,
            letterSpacing: "-.9px",
            lineHeight: 1.2,
            margin: "20px 0 0",
          }}
        >
          صوّر المشكلة فقط.
          <br />
          <span style={{ color: "var(--t-secondary)" }}>سنتكفّل بالباقي.</span>
        </h1>
        <p style={{ fontSize: 16, color: "var(--t-secondary)", lineHeight: 1.85, margin: "18px 0 0", maxWidth: "42ch" }}>
          يقرأ مستشار سُكن الصورة، ويحدّد نوع العطل وموقعه وخطورته وسببه المحتمل، ثم يجهّز البلاغ ويوجّهه للمقاول
          المختص. لا تحتاج لمعرفة التصنيف الفني.
        </p>

        <ol
          style={{
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            margin: "34px 0 0",
            padding: 0,
          }}
        >
          {[
            ["ارفع صورة واضحة للمشكلة", "من الكاميرا أو المعرض أو بالسحب والإفلات."],
            ["يحلّل المستشار الصورة", "نوع العطل، الموقع، الخطورة، والسبب المحتمل."],
            ["تراجع النتيجة وتؤكّد", "يمكنك تعديل أي حقل إن لم يكن دقيقاً."],
          ].map(([t, d], i) => (
            <li
              key={t}
              className="sk-rise"
              style={{ display: "flex", gap: 14, animationDelay: `${i * 90}ms` }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  flex: "none",
                  borderRadius: "50%",
                  background: "var(--n-surface2)",
                  color: "var(--g-700)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "inset 0 0 0 1px var(--n-border)",
                }}
              >
                {i + 1}
              </span>
              <span>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{t}</span>
                <span style={{ display: "block", fontSize: 13, color: "var(--t-tertiary)", marginTop: 3 }}>{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* --------------------------------------------------------- dropbox */}
      <div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            position: "relative",
            borderRadius: "var(--r-2xl)",
            padding: "38px 30px",
            background: dragging ? "var(--a-50)" : "var(--n-surface)",
            boxShadow: dragging
              ? "inset 0 0 0 2px var(--a-400), var(--sh-3)"
              : "inset 0 0 0 1.5px var(--n-border), var(--sh-2)",
            transition: "background .2s var(--ease), box-shadow .2s var(--ease)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <span
              style={{
                width: 68,
                height: 68,
                margin: "0 auto 18px",
                borderRadius: "var(--r-lg)",
                background: "linear-gradient(150deg,var(--g-700),var(--g-900))",
                color: "var(--t-on-dark)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--sh-2)",
              }}
            >
              <UploadCloudIcon size={30} />
            </span>
            <div style={{ fontSize: 18, fontWeight: 700 }}>أسقِط الصورة هنا</div>
            <p style={{ fontSize: 13.5, color: "var(--t-secondary)", margin: "7px 0 0" }}>
              أو اختر مصدر الصورة — حتى {MAX_SHOTS} صور، ١٢ ميجابايت للصورة.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
            <button onClick={() => cameraRef.current?.click()} style={{ ...brandButton("primary"), padding: "15px 18px" }}>
              <CameraIcon size={19} />
              الكاميرا
            </button>
            <button onClick={() => galleryRef.current?.click()} style={{ ...brandButton("ghost"), padding: "15px 18px" }}>
              <GalleryIcon size={19} />
              المعرض
            </button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              accept(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              accept(e.target.files);
              e.target.value = "";
            }}
          />

          {error && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginTop: 16,
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                background: "var(--err-bg)",
                color: "var(--err)",
                fontSize: 13,
                lineHeight: 1.6,
                boxShadow: "inset 0 0 0 1px rgba(188,70,48,.22)",
              }}
            >
              <AlertIcon size={17} />
              {error}
            </div>
          )}
        </div>

        {/* thumbnails */}
        {shots.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>الصور المرفقة</span>
              <span style={{ fontSize: 12.5, color: "var(--t-tertiary)" }}>
                {shots.length} من {MAX_SHOTS}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 11 }}>
              {shots.map((s, i) => (
                <div
                  key={s.id}
                  className="sk-rise"
                  style={{
                    position: "relative",
                    aspectRatio: "1/1",
                    borderRadius: "var(--r-md)",
                    overflow: "hidden",
                    boxShadow: "inset 0 0 0 1px var(--n-border)",
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    onClick={() => onRemove(s.id)}
                    aria-label="إزالة الصورة"
                    style={{
                      position: "absolute",
                      top: 6,
                      insetInlineStart: 6,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(13,27,52,.72)",
                      color: "var(--t-on-dark)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backdropFilter: "blur(6px)",
                    }}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={onAnalyze}
              style={{ ...brandButton("gold"), width: "100%", marginTop: 20, padding: "17px 26px", fontSize: 16 }}
            >
              حلّل الصورة بالذكاء الاصطناعي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
