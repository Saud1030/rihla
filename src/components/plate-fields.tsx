import { CAR_COLORS, PLATE_LETTERS, splitPlate } from "@/lib/plate";

/** Plate: three letter boxes and a numbers box, like the plate itself. Works in server and client forms. */
export function PlateFields({ value, label, lettersLabel, digitsLabel, invalid }: { value?: string | null; label: string; lettersLabel: string; digitsLabel: string; invalid?: boolean }) {
  const cur = splitPlate(value);
  return (
    <fieldset className="block min-w-0" data-testid="plate-fields">
      <legend className="block text-sm font-medium mb-1">{label}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="block text-xs text-muted mb-1">{lettersLabel}</span>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <select
                key={i}
                name={`plateL${i + 1}`}
                required
                defaultValue={cur.letters[i] ?? ""}
                aria-label={`${lettersLabel} ${i + 1}`}
                aria-invalid={invalid || undefined}
                className="field !w-16 text-center text-lg"
              >
                <option value="">-</option>
                {PLATE_LETTERS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="block text-xs text-muted mb-1">{digitsLabel}</span>
          <input
            name="plateDigits"
            required
            inputMode="numeric"
            pattern="[0-9٠-٩]{1,4}"
            maxLength={4}
            defaultValue={cur.digits}
            dir="ltr"
            aria-invalid={invalid || undefined}
            className="field !w-28 text-center text-lg tabular"
            placeholder="1234"
          />
        </label>
      </div>
    </fieldset>
  );
}

/** Car colour: one of ten basic colours */
export function ColorSelect({ value, lang, invalid, required = true }: { value?: string | null; lang: "ar" | "en"; invalid?: boolean; required?: boolean }) {
  const known = CAR_COLORS.some((c) => c.ar === value);
  return (
    <select name="carColor" required={required} defaultValue={value ?? ""} aria-invalid={invalid || undefined} className="field">
      <option value="">{lang === "ar" ? "اختر اللون" : "Choose a colour"}</option>
      {CAR_COLORS.map((c) => (
        <option key={c.ar} value={c.ar}>
          {c[lang]}
        </option>
      ))}
      {value && !known && <option value={value}>{value}</option>}
    </select>
  );
}
