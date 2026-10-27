/** Driver photo in the panel, or the first letter of the name when there is none */
export function DriverPhoto({ d, className }: { d: { id: number; name: string; hasPhoto: boolean; updatedAt: Date }; className: string }) {
  return d.hasPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element -- private photo from our own API route
    <img src={`/api/admin/drivers/${d.id}/photo?v=${d.updatedAt.getTime()}`} alt={d.name} className={`${className} object-cover bg-stone`} />
  ) : (
    <div className={`${className} grid place-items-center bg-sign-soft text-sign font-display text-2xl font-semibold`} aria-hidden>
      {d.name.trim().charAt(0)}
    </div>
  );
}
