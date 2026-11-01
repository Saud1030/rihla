"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatTime } from "@/lib/format";
import { farEnough } from "@/lib/lead-time";
import { useEarliest } from "./use-earliest";
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
  stopDate: string;
  stopTime: string;
  /** "أقرب موعد متاح للحجز:" */
  earliest: string;
  /** "اختر موعدًا بعد {at} ..." */
  tooSoon: string;
  city: string;
  chooseCity: string;
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
  /** book at least this many hours before the pickup (admin setting) */
  leadHours?: number;
  /** form id; the home page uses "search" so links can jump to it */
  id?: string;
};

/** "pf0"/"pt0", "pf1"/"pt1"... are the from/to of each trip in a multi-trip booking; "city" is the hourly city */
type Target = "from" | "to" | "hours" | "city" | `pf${number}` | `pt${number}`;
type Mode = "transfer" | "hourly" | "multi";
const MAX_LEGS = 20;
type Leg = { from: string; to: string; date: string; time: string };
const emptyLeg = (): Leg => ({ from: "", to: "", date: "", time: "" });
/** which trip and which end a target is, for multi-trip targets */
const legOf = (t: string | null) => (t && /^p[ft]\d+$/.test(t) ? { i: Number(t.slice(2)), end: t[1] === "f" ? ("from" as const) : ("to" as const) } : null);
type Nav = { region?: string; city?: string };
type Field = "from" | "to" | "date" | "time" | "soon";
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
  leadHours = 0,
  id = "search",
}: Props) {
  const [mode, setMode] = useState<Mode>("transfer");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [legs, setLegs] = useState<Leg[]>([emptyLeg(), emptyLeg()]);
  const [city, setCity] = useState("");
  const setLeg = (i: number, patch: Partial<Leg>) => setLegs((list) => list.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const [hours, setHours] = useState<10 | 12 | 24>(10);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [open, setOpen] = useState<Target | null>(null);
  const [nav, setNav] = useState<Nav>({});
  const [missing, setMissing] = useState<Field[]>([]);
  // the nearest pickup that can be booked (now + the admin's hours); earlier days and times aren't offered
  const earliest = useEarliest(leadHours);
  const dayMin = earliest && earliest.date > minDate ? earliest.date : minDate;
  const slotsFor = (d: string) => (!earliest || !d || d > earliest.date ? TIME_SLOTS : d < earliest.date ? [] : TIME_SLOTS.filter((x) => x >= earliest.time));
  const earliestText = earliest ? `${formatDate(earliest.date, lang)} - ${formatTime(earliest.time, lang)}` : "";
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

  // changing the date or time also clears the "too soon" message
  const clear = (f: Field) => setMissing((m) => m.filter((x) => x !== f && !(x === "soon" && (f === "date" || f === "time"))));

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
  function chooseCity(slug: string) {
    setCity(slug);
    clear("from");
    close();
  }
  function choose(slug: string) {
    const leg = legOf(open);
    if (leg) {
      setLeg(leg.i, { [leg.end]: slug });
      clear(leg.end);
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
  // a trip can't end where it starts
  const openLeg = legOf(open);
  const excluded = open === "to" ? from : openLeg ? legs[openLeg.i]?.[openLeg.end === "to" ? "from" : "to"] : "";

  const title =
    open === "hours"
      ? L.chooseDuration
      : open === "from"
        ? mode === "hourly"
          ? L.choosePickup
          : L.chooseFrom
        : open === "city"
          ? L.chooseCity
          : openLeg
            ? openLeg.end === "from"
              ? L.chooseFrom
              : L.chooseTo
            : L.chooseTo;
  const crumb = nav.city
    ? `${L.cityPrefix}${cityName}`
    : nav.region
      ? regionName(nav.region)
      : null;

  const placeButton = (o: ChoiceOption) => {
    const selected = (open === "from" ? from : openLeg ? legs[openLeg.i]?.[openLeg.end] : to) === o.slug;
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
    const leg = legOf(t);
    const bad =
      ((t === "from" || t === "city") && missing.includes("from")) ||
      (t === "to" && missing.includes("to")) ||
      (!!leg && !legs[leg.i]?.[leg.end] && missing.includes(leg.end));
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
    const leg = legOf(t);
    const v = bySlug.get(t === "from" ? from : leg ? legs[leg.i][leg.end] : to);
    return fieldButton(
      t,
      label,
      v?.name ?? null,
      v ? `${v.kindLabel} · ${v.city}` : "",
    );
  };

  const errorText = !missing.length
    ? null
    : missing[0] === "soon"
      ? L.tooSoon.replace("{at}", earliestText).replace("{hours}", num(leadHours))
      : L.missing[missing[0]];

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
                  onClick={() => (open === "city" ? chooseCity(c.slug) : setNav({ region: nav.region, city: c.slug }))}
                  aria-pressed={open === "city" ? city === c.slug : undefined}
                  data-city={c.slug}
                  className="rounded-lg border border-line px-3 py-2.5 text-start hover:border-sign"
                >
                  <span className="block text-[15px] font-medium leading-snug">
                    {flat ? `${L.cityPrefix}${c.name}` : c.name}
                  </span>
                  {open !== "city" && (
                    <span className="block text-xs text-muted tabular">
                      {num(c.count)} {L.places}
                    </span>
                  )}
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
        if (mode === "multi") {
          if (legs.some((l) => !l.from)) m.push("from");
          if (legs.some((l) => !l.to)) m.push("to");
          if (legs.some((l) => !l.date)) m.push("date");
          if (legs.some((l) => !l.time)) m.push("time");
          if (earliest && legs.some((l) => l.date && l.time && !farEnough(l.date, l.time, earliest))) m.push("soon");
        } else {
          if (mode === "hourly" ? !city : !from) m.push("from");
          if (mode === "transfer" && !to) m.push("to");
          if (!date) m.push("date");
          if (!time) m.push("time");
          if (earliest && date && time && !farEnough(date, time, earliest)) m.push("soon");
        }
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
      {mode === "transfer" && (
        <>
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
        </>
      )}
      {mode === "hourly" && (
        <>
          <input type="hidden" name="city" value={city} />
          <input type="hidden" name="hours" value={hours} />
        </>
      )}
      {mode === "multi" && legs.map((l, i) => <input key={i} type="hidden" name={`l${i + 1}`} value={`${l.from},${l.to},${l.date},${l.time}`} />)}

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
        /* separate trips, each from -> to, with its own date and time */
        <div className="space-y-3" data-testid="multi-legs-form">
          {/* many trips (up to MAX_LEGS): the list scrolls so the box stays a sensible height */}
          <div className={`grid gap-3 lg:grid-cols-2 ${legs.length > 4 ? "max-h-[26rem] overflow-y-auto overscroll-contain pe-1 pt-1" : ""}`} data-testid="multi-legs-list">
            {legs.map((l, i) => (
              <fieldset key={i} className="relative rounded-lg border border-white/25 p-3 space-y-2 min-w-0" data-testid={`leg-${i + 1}`}>
                <legend className="px-1 text-sm font-semibold">
                  {L.stop} {num(i + 1)}
                </legend>
                {legs.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setLegs((list) => list.filter((_, j) => j !== i));
                      setOpen(null);
                    }}
                    aria-label={`${L.removeStop} ${num(i + 1)}`}
                    title={L.removeStop}
                    className="absolute -top-3 end-2 grid place-items-center size-6 rounded-full bg-sign text-white/90 hover:bg-white/15"
                  >
                    <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true">
                      <path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {placeField(`pf${i}`, L.from)}
                  {placeField(`pt${i}`, L.to)}
                </div>
                <div className="grid grid-cols-2 gap-2 -mt-2">
                  <input
                    type="date"
                    min={dayMin}
                    max={maxDate}
                    value={l.date}
                    onChange={(e) => {
                      const d = e.target.value;
                      // a time that's too soon for the new day is cleared
                      setLeg(i, { date: d, ...(l.time && !slotsFor(d).includes(l.time) ? { time: "" } : {}) });
                      clear("date");
                    }}
                    aria-label={`${L.stopDate} ${num(i + 1)}`}
                    className={`field ${missing.includes("date") && !l.date ? "!border-danger ring-2 ring-danger/40" : ""}`}
                  />
                  <select
                    value={l.time}
                    onChange={(e) => {
                      setLeg(i, { time: e.target.value });
                      clear("time");
                    }}
                    aria-label={`${L.stopTime} ${num(i + 1)}`}
                    className={`field ${l.time ? "" : "text-muted"} ${missing.includes("time") && !l.time ? "!border-danger ring-2 ring-danger/40" : ""}`}
                  >
                    <option value="">{L.chooseTime}</option>
                    {slotsFor(l.date).map((x) => (
                      <option key={x} value={x}>
                        {formatTime(x, lang)}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
            ))}
          </div>
          {open && open !== "hours" && panel}
          <div className="grid gap-3 sm:grid-cols-2 items-center">
            {legs.length < MAX_LEGS ? (
              <button
                type="button"
                onClick={() => {
                  // the next trip usually starts where the last one ended
                  setLegs((list) => [...list, { ...emptyLeg(), from: list[list.length - 1]?.to ?? "" }]);
                  setOpen(null);
                }}
                className="rounded-lg border-2 border-dashed border-white/40 px-3 py-2 text-[15px] font-medium text-white hover:border-white hover:bg-white/10"
              >
                + {L.addStop}
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="btn btn-amber w-full text-[17px]">
              {L.showPrices}
            </button>
          </div>
        </div>
      ) : mode === "hourly" ? (
        /* car with a driver by the hour: one city */
        <div className="max-w-md">{fieldButton("city", L.city, allCities.find((c) => c.slug === city)?.name ? `${L.cityPrefix}${allCities.find((c) => c.slug === city)!.name}` : null, "")}</div>
      ) : (
      /* where from / where to */
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

      {mode !== "multi" && open && open !== "hours" && panel}

      {/* duration (hourly), date and time */}
      {mode !== "multi" && (
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
            min={dayMin}
            max={maxDate}
            value={date}
            onChange={(e) => {
              const d = e.target.value;
              setDate(d);
              if (time && !slotsFor(d).includes(time)) setTime("");
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
            {slotsFor(date).map((s) => (
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
      )}
      {open === "hours" && panel}

      {end && (
        <p className="text-sm text-white/90" data-testid="ends-at">
          {L.endsAt}:{" "}
          <span className="font-semibold">
            {formatEnd(end.time, end.dayOffset, lang)}
          </span>
        </p>
      )}

      {leadHours > 0 && earliest && (
        <p className="text-sm text-white/85" data-testid="search-earliest">
          {L.earliest} <bdi className="font-semibold">{earliestText}</bdi>
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
