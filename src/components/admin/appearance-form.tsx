"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import type { ActionState } from "@/app/admin/actions";
import { CORNERS, FONTS, PRESETS, isHex, themeCss, themeWarnings, type CornerKey, type FontKey, type Theme } from "@/lib/theme";

type Texts = Record<
  "company_name_ar" | "company_name_en" | "logo_text_ar" | "logo_text_en" | "hero_title_ar" | "hero_title_en" | "hero_lead_ar" | "hero_lead_en",
  string
>;

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initialTheme: Theme;
  initialTexts: Texts;
  placeholders: { heroTitle: string; heroLead: string };
  logoUrl: string | null;
};

function ColorField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  // keep the text box in sync when a preset changes the colour
  if (isHex(value) && value.toLowerCase() !== text.toLowerCase() && isHex(text)) setText(value);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (منتقي الألوان)`}
          value={isHex(value) ? value : "#000000"}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-line bg-paper p-1"
        />
        <input
          id={id}
          name={id}
          value={text}
          dir="ltr"
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            if (isHex(e.target.value)) onChange(e.target.value);
          }}
          aria-invalid={!isHex(text) || undefined}
          className="field !px-2 text-sm font-mono tabular uppercase min-w-0"
        />
      </div>
      <p className="text-xs text-muted mt-1">{hint}</p>
    </div>
  );
}

export function AppearanceForm({ action, initialTheme, initialTexts, placeholders, logoUrl }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [texts, setTexts] = useState<Texts>(initialTexts);
  const set = (patch: Partial<Theme>) => setTheme((t) => ({ ...t, ...patch, preset: patch.preset ?? "custom" }));
  const warnings = useMemo(() => themeWarnings(theme), [theme]);
  // scope the preview's variables to the preview box only
  const previewCss = useMemo(() => themeCss(theme).replace(":root", "#theme-preview"), [theme]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  const text = (key: keyof Texts, label: string, opts: { ltr?: boolean; max: number; placeholder?: string; area?: boolean; hint?: string }) => (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {opts.area ? (
        <textarea
          name={key}
          rows={2}
          maxLength={opts.max}
          value={texts[key]}
          placeholder={opts.placeholder}
          dir={opts.ltr ? "ltr" : undefined}
          onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
          className="field text-start"
        />
      ) : (
        <input
          name={key}
          maxLength={opts.max}
          value={texts[key]}
          placeholder={opts.placeholder}
          dir={opts.ltr ? "ltr" : undefined}
          onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
          className="field text-start"
        />
      )}
      {opts.hint && <span className="block text-xs text-muted mt-1">{opts.hint}</span>}
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[1fr_420px] items-start">
      <div className="space-y-6 min-w-0">
        <fieldset className="bg-paper border border-line rounded-xl p-6 space-y-4">
          <legend className="sr-only">اسم الشركة</legend>
          <h2 className="font-semibold">اسم الشركة</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {text("company_name_ar", "الاسم بالعربي", { max: 80 })}
            {text("company_name_en", "الاسم بالإنجليزي", { max: 80, ltr: true })}
            {text("logo_text_ar", "نص الشعار بالعربي", { max: 14, hint: "يظهر داخل اللوحة الخضراء إذا لم ترفع صورة شعار" })}
            {text("logo_text_en", "نص الشعار بالإنجليزي", { max: 14, ltr: true })}
          </div>
        </fieldset>

        <fieldset className="bg-paper border border-line rounded-xl p-6 space-y-5">
          <legend className="sr-only">الألوان</legend>
          <h2 className="font-semibold">الألوان</h2>
          <input type="hidden" name="preset" value={theme.preset} />
          <div>
            <p className="text-sm font-medium mb-2">ألوان جاهزة</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="ألوان جاهزة">
              {PRESETS.map((p) => {
                const active = theme.preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme((t) => ({ ...t, preset: p.key, primary: p.primary, accent: p.accent, background: p.background }))}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm ${active ? "border-sign ring-2 ring-sign" : "border-line hover:border-muted"}`}
                  >
                    <span className="flex shrink-0 overflow-hidden rounded-md border border-line" aria-hidden="true">
                      <span className="size-5" style={{ background: p.primary }} />
                      <span className="size-5" style={{ background: p.accent }} />
                      <span className="size-5" style={{ background: p.background }} />
                    </span>
                    {p.ar}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-4">
            <ColorField id="primary" label="اللون الأساسي" hint="الأزرار، اللوحات، الهيدر" value={theme.primary} onChange={(v) => set({ primary: v })} />
            <ColorField id="accent" label="لون التمييز" hint="شريط التنبيه وزر البحث" value={theme.accent} onChange={(v) => set({ accent: v })} />
            <ColorField id="background" label="لون الخلفية" hint="خلفية الصفحات" value={theme.background} onChange={(v) => set({ background: v })} />
          </div>
          {warnings.length > 0 && (
            <ul className="text-sm text-amber-deep bg-amber/15 border border-amber/50 rounded-lg px-4 py-3 space-y-1" role="status">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </fieldset>

        <fieldset className="bg-paper border border-line rounded-xl p-6 space-y-4">
          <legend className="sr-only">الخط والزوايا</legend>
          <h2 className="font-semibold">الخط والزوايا</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium mb-1">الخط</span>
              <select name="font" value={theme.font} onChange={(e) => set({ font: e.target.value as FontKey, preset: theme.preset })} className="field">
                {Object.entries(FONTS).map(([k, f]) => (
                  <option key={k} value={k}>
                    {f.ar}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-medium mb-1">شكل الزوايا</span>
              <select name="corners" value={theme.corners} onChange={(e) => set({ corners: e.target.value as CornerKey, preset: theme.preset })} className="field">
                {Object.entries(CORNERS).map(([k, c]) => (
                  <option key={k} value={k}>
                    {c.ar}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="bg-paper border border-line rounded-xl p-6 space-y-4">
          <legend className="sr-only">نص الواجهة</legend>
          <h2 className="font-semibold">نص الواجهة الرئيسية</h2>
          <p className="text-sm text-muted -mt-2">اتركه فارغًا لاستخدام النص الافتراضي الظاهر بالرمادي.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {text("hero_title_ar", "العنوان بالعربي", { max: 120, placeholder: placeholders.heroTitle })}
            {text("hero_title_en", "العنوان بالإنجليزي", { max: 120, ltr: true })}
            {text("hero_lead_ar", "الوصف بالعربي", { max: 300, area: true, placeholder: placeholders.heroLead })}
            {text("hero_lead_en", "الوصف بالإنجليزي", { max: 300, area: true, ltr: true })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "جارٍ الحفظ…" : "حفظ المظهر"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setTheme({ preset: PRESETS[0].key, primary: PRESETS[0].primary, accent: PRESETS[0].accent, background: PRESETS[0].background, font: "readex", corners: "medium" })}
          >
            الرجوع للتصميم الافتراضي
          </button>
          <p aria-live="polite" className="text-sm">
            {state.error && <span className="text-danger">{state.error}</span>}
            {state.ok && state.message && <span className="text-sign">{state.message}</span>}
          </p>
        </div>
      </div>

      {/* Live preview */}
      <aside className="xl:sticky xl:top-4">
        <p className="text-sm font-medium mb-2">معاينة مباشرة</p>
        <style>{previewCss}</style>
        <div id="theme-preview" className="rounded-xl border border-line overflow-hidden shadow-sm" style={{ background: "var(--color-stone)", fontFamily: "var(--font-sans)" }}>
          <div className="bg-amber text-ink text-center text-xs py-1">شريط التنبيه</div>
          <div className="bg-paper border-b border-line px-4 h-14 flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-9 w-auto max-w-28 object-contain" />
            ) : (
              <span className="sign grid place-items-center h-9 px-3 font-display font-semibold text-sm">{texts.logo_text_ar || "رحلة"}</span>
            )}
            <span className="font-display font-medium text-sm truncate">{texts.company_name_ar}</span>
            <span className="btn btn-primary !min-h-8 !py-1 !px-3 text-xs ms-auto">احجز الآن</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="font-display text-xl font-semibold leading-snug">{texts.hero_title_ar || placeholders.heroTitle}</p>
            <div className="sign p-4 space-y-2">
              <p className="font-display font-semibold">مكة المكرمة</p>
              <span className="btn btn-amber w-full !min-h-9 text-sm">اعرض الأسعار</span>
            </div>
            <div className="bg-paper border border-line rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm">جدة ← مكة</span>
              <span className="font-display font-semibold tabular">٢٥٠ ر.س</span>
            </div>
          </div>
        </div>
      </aside>
    </form>
  );
}
