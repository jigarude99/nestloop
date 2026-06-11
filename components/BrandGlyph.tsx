/** Mismo icono de la app para encabezado, login y setup. */
export function BrandGlyph({ size = 26 }: { size?: number }) {
  return (
    <img
      className="brand-glyph-img"
      src="/icon-192.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}
