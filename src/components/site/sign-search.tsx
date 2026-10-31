"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import { addToClock, formatEnd, TIME_SLOTS } from "@/lib/timespan";

export type ChoiceOption = {
  slug: string;
  name: string;
  citySlug: string;
  city: string;
  regionSlug: string;
  kindLabel: string;
};

export type SignSearchLabels = {
  transfer: string;
  hourly: string;
  from: string;
  to: string;
  pickupPlace: string;
  duration: string;
  hoursLabel: Record<10 | 12 | 24, string>;
  choose: string;
  chooseTime: string;
  date: string;
  time: string;
  endsAt: string;
  showPrices: string;
  missing: { from: string; to: string; date: string; time: string };
  regions: string;
  multi: string;
  stop: string;
  addStop: string;
  removeStop: string;
  chooseStop: string;
  cities: string;
  /** word shown before a city's name in the chooser ("مدينة ") */
  cityPrefix: string;
  back: string;
  close: string;
  chooseFrom: string;
  chooseTo: string;
  choosePickup: string;
  chooseDuration: string;
  places: string;
  swap: string;
};

type Props = {
  lang: "ar" | "en";
  action: string;
  labels: SignSearchLabels;
  options: ChoiceOption[];
  regions: { slug: string; name: string }[];
  hourlyEnabled: boolean;
  multiEnabled: boolean;
  minDate: string;
  maxDate: string;
  /** form id; the home page uses "search" so links can jump to it */
  id?: string;
};

/** "s0", "s1"... are the stops of a multi-destination trip */
type Target = "from" | "to" | "hours" | `s${number}`;
type Mode = "transfer" | "hourly" | "multi";
const MAX_STOPS = 5;
type Nav = { region?: string; city?: string };
type Field = "from" | "to" | "date" | "time";
const PACKAGES = [10, 12, 24] as const;

export function SignSearch({
  lang,
  action,
  labels: L,
  options,
  regions,
  hourlyEnabled,
  multiEnabled,
  minDate,
  maxDate,
  id = "search",
}: Props) {
  const [mode, setMode] = useState<Mode>("transfer");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stops, setStops] = useState<string[]>(["", ""]);
  const [hours, setHours] = useState<10 | 12 | 24>(10);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [open, setOpen] = useState<Target | null>(null);
  const [nav, setNav] = useState<Nav>({});
  const [missing, setMissing] = useState<Field[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const num = (n: number) =>
    n.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelId = `${id}-panel`;

  const bySlug = useMemo(
    () => new Map(options.map((o) => [o.slug, o])),
    [options],
  );
  const regionsWithPlaces = useMemo(
    () =>
      regions
        .map((r) => ({
          ...r,
          count: options.filter((o) => o.regionSlug === r.slug).length,
        }))
        .filter((r) => r.count > 0),
    [regions, options],
  );

  // a small catalog (the company's own cities) is shown as a flat list of cities, no regions step
  const allCities = useMemo(
    () =>
      [...new Map(options.map((o) => [o.citySlug, o.city])).entries()].map(
        ([slug, name]) => ({
          slug,
          name,
          count: options.filter((o) => o.citySlug === slug).length,
        }),
      ),
    [options],
  );
  const flat = allCities.length <= 12;

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, nav]);

  const clear = (f: Field) => setMissing((m) => m.filter((x) => x !== f));

  function openFor(t: Target) {
    if (open === t) return close();
    setOpen(t);
    setNav({});
  }
  function close(refocus = true) {
    const t = open;
    setOpen(null);
    setNav({});
    if (refocus && t) triggers.current[t]?.focus();
  }
  function choose(slug: string) {
    if (open?.startsWith("s")) {
      const i = Number(open.slice(1));
      setStops((list) => list.map((x, j) => (j === i ? slug : x)));
      clear("to");
    } else if (open === "from") {
      setFrom(slug);
      clear("from");
      if (slug === to) setTo("");
    } else {
      setTo(slug);
      clear("to");
    }
    close();
  }

  const modes: Mode[] = ["transfer", ...(hourlyEnabled ? (["hourly"] as const) : []), ...(multiEnabled ? (["multi"] as const) : [])];
  const end =
    mode === "hourly" && time
      ? addToClock(date || null, time, hours * 60)
      : null;

  /* ---------- panel content ---------- */
  const regionName = (slug?: string) =>
    regions.find((r) => r.slug === slug)?.name ?? "";
  const cityList = flat
    ? allCities
    : nav.region
    ? [
        ...new Map(
          options
            .filter((o) => o.regionSlug === nav.region)
            .map((o) => [o.citySlug, o.city]),
        ).entries(),
      ].map(([slug, name]) => ({
        slug,
        name,
        count: options.filter((o) => o.citySlug === slug).length,
      }))
    : [];
  const placeGroups = nav.city
    ? [
        ...new Set(
          options
            .filter((o) => o.citySlug === nav.city)
            .map((o) => o.kindLabel),
        ),
      ].map((k) => ({
        kind: k,
        items: options.filter(
          (o) => o.citySlug === nav.city && o.kindLabel === k,
        ),
      }))
    : [];
  const cityName = options.find((o) => o.citySlug === nav.city)?.city ?? "";
  // the place right before a stop can't be chosen again for it
  const excluded = open === "to" ? from : open?.startsWith("s") ? (Number(open.slice(1)) === 0 ? from : stops[Number(open.slice(1)) - 1]) : "";

  const title =
    open === "hours"
      ? L.chooseDuration
      : open === "from"
        ? mode === "hourly"
          ? L.choosePickup
          : L.chooseFrom
        : open?.startsWith("s")
          ? L.chooseStop
          : L.chooseTo;
  const crumb = nav.city
    ? `${L.cityPrefix}${cityName}`
    : nav.region
      ? regionName(nav.region)
      : null;

  const placeButton = (o: ChoiceOption) => {
    const selected = (open === "from" ? from : open?.startsWith("s") ? stops[Number(open.slice(1))] : to) === o.slug;
    return (
      <button
        key={o.slug}
        type="button"
        disabled={o.slug === excluded}
        onClick={() => choose(o.slug)}
        aria-pressed={selected}
        className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-start text-[15px] disabled:opacity-40 ${
          selected
            ? "border-sign bg-sign-soft"
            : "border-line hover:border-sign"
        }`}
      >
        <span className="min-w-0">{o.name}</span>
        <span className="shrink-0 text-xs text-muted">{o.kindLabel}</span>
      </button>
    );
  };

  /** A tap-to-open field: from, to or duration */
  const fieldButton = (
    t: Target,
    label: string,
    shown: string | null,
    sub: string,
  ) => {
    const isOpen = open === t;
    const bad = (t === "from" && missing.includes("from")) || ((t === "to" || (t.startsWith("s") && !stops[Number(t.slice(1))])) && missing.includes("to"));
    return (
      <div className="min-w-0">
        <span
          className="block text-sm text-white/85 mb-1"
          id={`${id}-${t}-label`}
        >
          {label}
        </span>
        <button
          ref={(el) => {
            triggers.current[t] = el;
          }}
          type="button"
          onClick={() => openFor(t)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-labelledby={`${id}-${t}-label ${id}-${t}-value`}
          aria-invalid={bad || undefined}
          data-field={t}
          className={`field !flex items-center justify-between gap-2 text-start ${isOpen ? "!border-amber ring-2 ring-amber" : ""} ${bad ? "!border-danger ring-2 ring-danger/40" : ""}`}
        >
          <span
            id={`${id}-${t}-value`}
            className={`truncate ${shown ? "" : "text-muted"}`}
          >
            {shown ?? L.choose}
          </span>
          <svg
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <path
              d="m5 8 5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="block text-xs text-white/75 mt-1 truncate min-h-4">
          {sub}
        </span>
      </div>
    );
  };
  const placeField = (t: Target, label: string) => {
    const v = bySlug.get(t === "from" ? from : t.startsWith("s") ? stops[Number(t.slice(1))] : to);
    return fieldButton(
      t,
      label,
      v?.name ?? null,
      v ? `${v.kindLabel} · ${v.city}` : "",
    );
  };

  const errorText = missing.length ? L.missing[missing[0]] : null;

  const panel = (
    <div
      id={panelId}
      role="region"
      aria-label={title}
      className="rounded-xl bg-paper text-ink p-4 shadow-lg"
    >
      <div className="flex items-center gap-2 mb-3">
        {(nav.region || nav.city) && (
          <button
            type="button"
            onClick={() => setNav(nav.city && !flat ? { region: nav.region } : {})}
            className="grid place-items-center size-8 rounded-md border border-line hover:border-sign shrink-0"
            aria-label={L.back}
          >
            <svg
              viewBox="0 0 20 20"
              className="size-4 rtl:-scale-x-100"
              aria-hidden="true"
            >
              <path
                d="M12 5 7 10l5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="font-display font-semibold text-[17px] flex-1 min-w-0 truncate outline-none"
        >
          {crumb ?? title}
        </h3>
        <button
          type="button"
          onClick={() => close()}
          className="grid place-items-center size-8 rounded-md hover:bg-stone shrink-0"
          aria-label={L.close}
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
            <path
              d="m5 5 10 10M15 5 5 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {open === "hours" ? (
        <div className="grid grid-cols-3 gap-2">
          {PACKAGES.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={hours === h}
              onClick={() => {
                setHours(h);
                close();
              }}
              className={`rounded-lg border px-3 py-3 text-[15px] font-medium ${hours === h ? "border-sign bg-sign-soft" : "border-line hover:border-sign"}`}
            >
              {L.hoursLabel[h]}
            </button>
          ))}
        </div>
      ) : (
        <div className="max-h-[22rem] overflow-y-auto -mx-1 px-1 space-y-4">
          {!flat && !nav.region && !nav.city && (
            <section>
              <h4 className="text-xs font-semibold text-muted mb-2">
                {L.regions}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {regionsWithPlaces.map((r) => (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => setNav({ region: r.slug })}
                    className="rounded-lg border border-line px-3 py-2.5 text-start hover:border-sign"
                  >
                    <span className="block text-[15px] font-medium leading-snug">
                      {r.name}
                    </span>
                    <span className="block text-xs text-muted tabular">
                      {num(r.count)} {L.places}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {(flat ? !nav.city : nav.region && !nav.city) && (
            <section>
              {flat && (
                <h4 className="text-xs font-semibold text-muted mb-2">
                  {L.cities}
                </h4>
              )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {cityList.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setNav({ region: nav.region, city: c.slug })}
                  data-city={c.slug}
                  className="rounded-lg border border-line px-3 py-2.5 text-start hover:border-sign"
                >
                  <span className="block text-[15px] font-medium leading-snug">
                    {flat ? `${L.cityPrefix}${c.name}` : c.name}
                  </span>
                  <span className="block text-xs text-muted tabular">
                    {num(c.count)} {L.places}
                  </span>
                </button>
              ))}
            </div>
            </section>
          )}

          {nav.city &&
            placeGroups.map((g) => (
              <section key={g.kind}>
                <h4 className="text-xs font-semibold text-muted mb-2">
                  {g.kind}
                </h4>
                <div className="grid gap-2">{g.items.map(placeButton)}</div>
              </section>
            ))}
        </div>
      )}
    </div>
  );

  return (
    <form
      action={action}
      method="get"
      id={id}
      noValidate
      onSubmit={(e) => {
        const m: Field[] = [];
        if (!from) m.push("from");
        if (mode === "multi" ? stops.some((x) => !x) : !to) m.push("to");
        if (!date) m.push("date");
        if (!time) m.push("time");
        if (m.length) {
          e.preventDefault();
          setMissing(m);
          setOpen(null);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          close();
        }
      }}
      className="space-y-3"
    >
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="from" value={from} />
      {mode === "multi" ? <input type="hidden" name="stops" value={stops.join(",")} /> : <input type="hidden" name="to" value={to} />}
      {mode === "hourly" && <input type="hidden" name="hours" value={hours} />}

      {modes.length > 1 && (
        <div
          className={`grid gap-1 rounded-lg bg-white/10 p-1 sm:max-w-xl ${modes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
          role="tablist"
          aria-label={modes.map((m) => L[m]).join(" / ")}
        >
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setOpen(null);
                setMissing([]);
              }}
              className={`rounded-md py-2 text-[15px] font-medium ${mode === m ? "bg-paper text-sign" : "text-white hover:bg-white/10"}`}
            >
              {L[m]}
            </button>
          ))}
        </div>
      )}

      {mode === "multi" ? (
        /* start + stops, in order */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="multi-stops">
          {placeField("from", L.from)}
          {stops.map((_, i) => (
            <div key={i} className="relative min-w-0">
              {placeField(`s${i}`, `${L.stop} ${num(i + 1)}`)}
              {stops.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setStops((list) => list.filter((_, j) => j !== i));
                    setOpen(null);
                  }}
                  aria-label={`${L.removeStop} ${num(i + 1)}`}
                  title={L.removeStop}
                  className="absolute top-0 end-0 grid place-items-center size-6 rounded-full text-white/85 hover:bg-white/15"
                >
                  <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true">
                    <path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {stops.length < MAX_STOPS && (
            <button
              type="button"
              onClick={() => {
                setStops((list) => [...list, ""]);
                setOpen(`s${stops.length}`);
                setNav({});
              }}
              className="self-start sm:mt-6 rounded-lg border-2 border-dashed border-white/40 px-3 py-2.5 text-[15px] font-medium text-white hover:border-white hover:bg-white/10"
            >
              + {L.addStop}
            </button>
          )}
        </div>
      ) : (
      /* where from / where to: the same in transfer and hourly */
      <div className="relative grid gap-3 sm:grid-cols-2 sm:gap-x-10">
        {placeField("from", L.from)}
        {/* swap from <-> to: in the flow on phones, between the two fields on wider screens */}
        <button
          type="button"
          onClick={() => {
            setFrom(to);
            setTo(from);
            setOpen(null);
          }}
          disabled={!from && !to}
          aria-label={L.swap}
          title={L.swap}
          className="justify-self-center -my-2 sm:my-0 sm:absolute sm:start-1/2 sm:-translate-x-1/2 rtl:sm:translate-x-1/2 sm:top-[29px] z-10 grid place-items-center size-9 rounded-full bg-paper text-sign border border-line shadow-sm hover:border-sign disabled:opacity-60"
        >
          <svg
            viewBox="0 0 20 20"
            className="size-4 rotate-90 sm:rotate-0"
            aria-hidden="true"
          >
            <path
              d="M4 7h11m0 0-3-3m3 3-3 3M16 13H5m0 0 3-3m-3 3 3 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {placeField("to", L.to)}
      </div>
      )}

      {open && open !== "hours" && panel}

      {/* duration (hourly), date and time */}
      <div
        className={`grid grid-cols-2 gap-3 items-end ${mode === "hourly" ? "sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,14rem)]" : "lg:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,14rem)]"}`}
      >
        {mode === "hourly" && (
          <div className="col-span-2 sm:col-span-1">
            {fieldButton("hours", L.duration, L.hoursLabel[hours], "")}
          </div>
        )}
        <label className="block min-w-0 self-start">
          <span className="block text-sm text-white/85 mb-1">{L.date}</span>
          <input
            type="date"
            name="date"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              clear("date");
            }}
            aria-invalid={missing.includes("date") || undefined}
            className={`field ${missing.includes("date") ? "!border-danger ring-2 ring-danger/40" : ""}`}
          />
        </label>
        <label className="block min-w-0 self-start">
          <span className="block text-sm text-white/85 mb-1">{L.time}</span>
          <select
            name="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              clear("time");
            }}
            aria-invalid={missing.includes("time") || undefined}
            className={`field ${time ? "" : "text-muted"} ${missing.includes("time") ? "!border-danger ring-2 ring-danger/40" : ""}`}
          >
            <option value="">{L.chooseTime}</option>
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>
                {formatTime(s, lang)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-amber w-full text-[17px] col-span-2 sm:col-span-full lg:col-span-1 lg:self-end">
          {L.showPrices}
        </button>
      </div>
      {open === "hours" && panel}

      {end && (
        <p className="text-sm text-white/90" data-testid="ends-at">
          {L.endsAt}:{" "}
          <span className="font-semibold">
            {formatEnd(end.time, end.dayOffset, lang)}
          </span>
        </p>
      )}

      {errorText && (
        <p
          className="text-sm bg-danger-soft text-danger rounded-md px-3 py-2"
          role="alert"
        >
          {errorText}
        </p>
      )}

    </form>
  );
}
