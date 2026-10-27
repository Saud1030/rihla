"use client";

import { useState } from "react";
import { WhatsAppIcon } from "@/components/icons";

type Labels = { name: string; ref: string; message: string; send: string; hint: string; empty: string };

/** Writes the message into WhatsApp (nothing is stored on our side). */
export function ContactForm({ whatsapp, labels: L }: { whatsapp: string; labels: Labels }) {
  const [error, setError] = useState(false);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const msg = String(f.get("message") ?? "").trim();
        if (!msg) return setError(true);
        const name = String(f.get("name") ?? "").trim();
        const ref = String(f.get("ref") ?? "").trim();
        const text = [name && `${L.name}: ${name}`, ref && `${L.ref}: ${ref}`, msg].filter(Boolean).join("\n");
        window.open(`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }}
      className="space-y-4"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-sm font-medium mb-1">{L.name}</span>
          <input name="name" maxLength={100} autoComplete="name" className="field" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">{L.ref}</span>
          <input name="ref" maxLength={12} dir="ltr" className="field text-start uppercase" />
        </label>
      </div>
      <label className="block">
        <span className="block text-sm font-medium mb-1">{L.message}</span>
        <textarea
          name="message"
          rows={4}
          maxLength={1000}
          aria-invalid={error || undefined}
          onChange={() => setError(false)}
          className="field"
        />
        {error && (
          <span className="block text-sm text-danger mt-1" role="alert">
            {L.empty}
          </span>
        )}
      </label>
      <button type="submit" className="btn btn-primary">
        <WhatsAppIcon className="size-5" />
        {L.send}
      </button>
      <p className="text-xs text-muted">{L.hint}</p>
    </form>
  );
}
