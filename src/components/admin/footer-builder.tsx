"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/admin/actions";
import { MorphButton } from "@/components/morph-button";
import {
  blankItem,
  footerImg,
  MAX_COLUMNS,
  MAX_ITEMS,
  MAX_PAY,
  newId,
  type FooterColumn,
  type FooterConfig,
  type FooterItem,
  type FooterItemKind,
  type PayItem,
  type Tr,
} from "@/lib/footer";

const KIND_LABELS: Record<FooterItemKind, string> = {
  link: "رابط",
  text: "نص (عنوان وقيمة)",
  contact: "تواصل بأيقونة (هاتف، بريد…)",
  badge: "شارة بصورة (ترخيص، توثيق، شهادة…)",
  heading: "عنوان فرعي (مثل اسم مدينة)",
  bullet: "نقطة في قائمة (مثل فرع أو معرض)",
};
const ICON_LABELS = { phone: "هاتف", email: "بريد", whatsapp: "واتساب", location: "موقع", none: "بدون" } as const;

const move = <T,>(list: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function TrInputs({ label, value, onChange, max = 150, multiline = false }: { label: string; value: Tr; onChange: (v: Tr) => void; max?: number; multiline?: boolean }) {
  const El = multiline ? "textarea" : "input";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="block mb-1 font-medium">{label} (عربي)</span>
        <El value={value.ar} maxLength={max} onChange={(e) => onChange({ ...value, ar: e.target.value })} className="field" {...(multiline ? { rows: 2 } : {})} />
      </label>
      <label className="block text-sm">
        <span className="block mb-1 font-medium">{label} (إنجليزي)</span>
        <El value={value.en} maxLength={max} dir="ltr" onChange={(e) => onChange({ ...value, en: e.target.value })} className="field text-start" {...(multiline ? { rows: 2 } : {})} />
      </label>
    </div>
  );
}

function SmallBtn({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`btn btn-ghost border border-line !min-h-8 !py-0.5 !px-2.5 text-sm ${danger ? "text-danger" : ""}`}>
      {children}
    </button>
  );
}

/** the picture of an item or a payment logo: shows the current one, the newly picked one, or nothing */
function ImageSlot({ id, img, preview, onPick, onRemove }: { id: string; img: string; preview?: string; onPick: (url: string | null) => void; onRemove: () => void }) {
  const src = preview ?? (img ? footerImg(id, img) : null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="grid place-items-center h-12 w-20 rounded-md border border-dashed border-line bg-stone/60 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" className="max-h-11 max-w-[76px] object-contain" /> : <span className="text-[11px] text-muted">بدون صورة</span>}
      </div>
      <input
        type="file"
        name={`img_${id}`}
        accept="image/png,image/jpeg,image/webp"
        data-testid={`footer-img-${id}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          onPick(f ? URL.createObjectURL(f) : null);
        }}
        className="text-sm max-w-56 file:me-2 file:rounded-md file:border-0 file:bg-sign file:px-2.5 file:py-1.5 file:text-white"
      />
      {(img || preview) && (
        <button
          type="button"
          className="text-sm text-danger hover:underline"
          onClick={(e) => {
            const input = e.currentTarget.parentElement?.querySelector<HTMLInputElement>("input[type=file]");
            if (input) input.value = "";
            onRemove();
          }}
        >
          إزالة الصورة
        </button>
      )}
    </div>
  );
}

export function FooterBuilder({ initial, action }: { initial: FooterConfig; action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [cfg, setCfg] = useState(initial);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // after a save the page reloads the stored version (with the pictures' versions): take it in
  const initialJson = JSON.stringify(initial);
  const [seen, setSeen] = useState(initialJson);
  if (seen !== initialJson) {
    setSeen(initialJson);
    setCfg(JSON.parse(initialJson));
  }
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.ok) setPreviews({});
  }
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.querySelectorAll<HTMLInputElement>("input[type=file]").forEach((i) => (i.value = ""));
    router.refresh();
  }, [state, router]);

  const setCol = (i: number, c: Partial<FooterColumn>) => setCfg((x) => ({ ...x, columns: x.columns.map((col, k) => (k === i ? { ...col, ...c } : col)) }));
  const setItem = (ci: number, ii: number, it: Partial<FooterItem>) =>
    setCfg((x) => ({ ...x, columns: x.columns.map((col, k) => (k === ci ? { ...col, items: col.items.map((t, j) => (j === ii ? { ...t, ...it } : t)) } : col)) }));
  const setPay = (i: number, p: Partial<PayItem>) => setCfg((x) => ({ ...x, pay: x.pay.map((t, k) => (k === i ? { ...t, ...p } : t)) }));
  const pick = (id: string) => (url: string | null) =>
    setPreviews((p) => {
      const next = { ...p };
      if (url) next[id] = url;
      else delete next[id];
      return next;
    });
  const unpick = (id: string) => setPreviews((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)));

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("config", JSON.stringify(cfg));
    startTransition(() => formAction(data));
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6" data-testid="footer-builder">
      <div className="space-y-2">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" name="custom" checked={cfg.custom} onChange={(e) => setCfg({ ...cfg, custom: e.target.checked })} className="size-4 accent-sign" />
          استخدم التذييل المخصص (الأعمدة والصور وبوابات الدفع أدناه)
        </label>
        <p className="text-xs text-muted">بدون هذا الخيار يظهر التذييل البسيط بالإعدادات التي فوق.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.showAbout} onChange={(e) => setCfg({ ...cfg, showAbout: e.target.checked })} className="size-4 accent-sign" />
          إظهار اسم الشركة ونبذتها كأول عمود
        </label>
      </div>

      {/* the help strip */}
      <fieldset className="rounded-xl border border-line p-4 space-y-3">
        <legend className="px-2 font-semibold">شريط المساعدة (أعلى التذييل)</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.help.on} onChange={(e) => setCfg({ ...cfg, help: { ...cfg.help, on: e.target.checked } })} className="size-4 accent-sign" />
          إظهار الشريط (الزر يفتح المحادثة المباشرة، أو صفحة التواصل إذا كانت المحادثة مقفلة)
        </label>
        <TrInputs label="العنوان" value={cfg.help.title} max={120} onChange={(v) => setCfg({ ...cfg, help: { ...cfg.help, title: v } })} />
        <TrInputs label="الوصف" value={cfg.help.text} max={300} onChange={(v) => setCfg({ ...cfg, help: { ...cfg.help, text: v } })} />
        <TrInputs label="نص الزر" value={cfg.help.button} max={40} onChange={(v) => setCfg({ ...cfg, help: { ...cfg.help, button: v } })} />
      </fieldset>

      {/* columns */}
      <div className="space-y-4">
        <h3 className="font-semibold">الأعمدة</h3>
        {cfg.columns.map((col, ci) => (
          <fieldset key={col.id} className="rounded-xl border border-line p-4 space-y-4" data-testid="footer-column">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">العمود {ci + 1}</span>
              <span className="ms-auto flex gap-1.5">
                <SmallBtn label="تقديم العمود" onClick={() => setCfg({ ...cfg, columns: move(cfg.columns, ci, -1) })}>→</SmallBtn>
                <SmallBtn label="تأخير العمود" onClick={() => setCfg({ ...cfg, columns: move(cfg.columns, ci, 1) })}>←</SmallBtn>
                <SmallBtn label="حذف العمود" danger onClick={() => setCfg({ ...cfg, columns: cfg.columns.filter((_, k) => k !== ci) })}>حذف العمود</SmallBtn>
              </span>
            </div>
            <TrInputs label="عنوان العمود" value={col.title} max={80} onChange={(v) => setCol(ci, { title: v })} />

            <ol className="space-y-3">
              {col.items.map((it, ii) => (
                <li key={it.id} className="rounded-lg bg-stone/50 p-3 space-y-3" data-testid="footer-item">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={it.kind} onChange={(e) => setItem(ci, ii, { kind: e.target.value as FooterItemKind })} className="field !w-auto !min-h-9 !py-1 text-sm" aria-label="نوع العنصر">
                      {(Object.keys(KIND_LABELS) as FooterItemKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <span className="ms-auto flex gap-1.5">
                      <SmallBtn label="لأعلى" onClick={() => setCol(ci, { items: move(col.items, ii, -1) })}>↑</SmallBtn>
                      <SmallBtn label="لأسفل" onClick={() => setCol(ci, { items: move(col.items, ii, 1) })}>↓</SmallBtn>
                      <SmallBtn label="حذف العنصر" danger onClick={() => setCol(ci, { items: col.items.filter((_, k) => k !== ii) })}>حذف</SmallBtn>
                    </span>
                  </div>
                  <TrInputs
                    label={it.kind === "link" ? "نص الرابط" : it.kind === "heading" ? "العنوان الفرعي" : it.kind === "bullet" ? "النص" : "العنوان"}
                    value={it.label}
                    onChange={(v) => setItem(ci, ii, { label: v })}
                  />
                  {(it.kind === "text" || it.kind === "contact" || it.kind === "badge") && (
                    <TrInputs label="القيمة (الرقم، العنوان…)" value={it.value} max={300} onChange={(v) => setItem(ci, ii, { value: v })} />
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                    {it.kind === "contact" && (
                      <label className="block text-sm">
                        <span className="block mb-1 font-medium">الأيقونة</span>
                        <select value={it.icon} onChange={(e) => setItem(ci, ii, { icon: e.target.value as FooterItem["icon"] })} className="field !w-auto">
                          {(Object.keys(ICON_LABELS) as (keyof typeof ICON_LABELS)[]).map((k) => (
                            <option key={k} value={k}>
                              {ICON_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {it.kind !== "heading" && (
                      <label className="block text-sm grow min-w-52">
                        <span className="block mb-1 font-medium">
                          {it.kind === "link" ? "الرابط" : "رابط (اختياري)"}
                          <span className="font-normal text-muted"> — صفحة في الموقع مثل /routes أو رابط كامل https://</span>
                        </span>
                        <input value={it.url} maxLength={500} dir="ltr" onChange={(e) => setItem(ci, ii, { url: e.target.value })} className="field text-start" placeholder="/terms" />
                      </label>
                    )}
                  </div>
                  {(it.kind === "badge" || it.kind === "text") && (
                    <ImageSlot id={it.id} img={it.img} preview={previews[it.id]} onPick={pick(it.id)} onRemove={() => (unpick(it.id), setItem(ci, ii, { img: "" }))} />
                  )}
                </li>
              ))}
            </ol>
            {col.items.length < MAX_ITEMS && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted self-center">إضافة:</span>
                {(Object.keys(KIND_LABELS) as FooterItemKind[]).map((k) => (
                  <button key={k} type="button" className="btn btn-ghost border border-line !min-h-8 !py-0.5 text-sm" onClick={() => setCol(ci, { items: [...col.items, blankItem(k)] })}>
                    + {KIND_LABELS[k].split(" (")[0]}
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        ))}
        {cfg.columns.length < MAX_COLUMNS && (
          <button
            type="button"
            className="btn btn-ghost border border-line"
            onClick={() => setCfg({ ...cfg, columns: [...cfg.columns, { id: newId(), title: { ar: "", en: "" }, items: [blankItem("text")] }] })}
          >
            + إضافة عمود
          </button>
        )}
      </div>

      {/* payment methods */}
      <fieldset className="rounded-xl border border-line p-4 space-y-3" data-testid="footer-pay">
        <legend className="px-2 font-semibold">بوابات وطرق الدفع</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.payOn} onChange={(e) => setCfg({ ...cfg, payOn: e.target.checked })} className="size-4 accent-sign" />
          إظهار شعارات طرق الدفع أسفل التذييل
        </label>
        <p className="text-xs text-muted">ارفع صورة شعار كل طريقة (PNG أو WEBP بخلفية شفافة أفضل). بدون صورة يظهر اسمها في إطار صغير.</p>
        <ul className="space-y-2">
          {cfg.pay.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-stone/50 p-2.5" data-testid="footer-pay-item">
              <input type="checkbox" checked={p.on} onChange={(e) => setPay(i, { on: e.target.checked })} className="size-4 accent-sign" aria-label={`إظهار ${p.name}`} />
              <input value={p.name} maxLength={40} onChange={(e) => setPay(i, { name: e.target.value })} className="field !w-44" aria-label="الاسم" />
              <ImageSlot id={p.id} img={p.img} preview={previews[p.id]} onPick={pick(p.id)} onRemove={() => (unpick(p.id), setPay(i, { img: "" }))} />
              <span className="ms-auto flex gap-1.5">
                <SmallBtn label="لأعلى" onClick={() => setCfg({ ...cfg, pay: move(cfg.pay, i, -1) })}>↑</SmallBtn>
                <SmallBtn label="لأسفل" onClick={() => setCfg({ ...cfg, pay: move(cfg.pay, i, 1) })}>↓</SmallBtn>
                <SmallBtn label="حذف" danger onClick={() => setCfg({ ...cfg, pay: cfg.pay.filter((_, k) => k !== i) })}>حذف</SmallBtn>
              </span>
            </li>
          ))}
        </ul>
        {cfg.pay.length < MAX_PAY && (
          <button type="button" className="btn btn-ghost border border-line !min-h-9 text-sm" onClick={() => setCfg({ ...cfg, pay: [...cfg.pay, { id: newId(), name: "", on: true, img: "" }] })}>
            + إضافة طريقة دفع
          </button>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-paper/95 backdrop-blur py-3 border-t border-line">
        <MorphButton type="submit" busy={pending} disabled={pending} label="حفظ التذييل المخصص" busyLabel="جارٍ الحفظ…" className="btn btn-primary" />
        <p aria-live="polite" className="text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
          {state.ok && state.message && <span className="text-sign">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}
