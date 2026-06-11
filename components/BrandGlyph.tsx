/** Logo minimalista de NestLoop para el encabezado dentro de la app
 *  (casa dentro de un bucle con un sol). Se mantiene simple porque se
 *  muestra muy pequeño; el ícono de la app instalada es la imagen a color. */
export function BrandGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden="true">
      <path
        d="M290 110 A150 150 0 1 1 222 110"
        fill="none"
        stroke="#0f9f7a"
        strokeWidth="32"
        strokeLinecap="round"
      />
      <circle cx="256" cy="100" r="34" fill="#f6c64f" />
      <path d="M194 248 L256 190 L318 248 Z" fill="#f7f8f4" />
      <rect x="206" y="244" width="100" height="96" rx="14" fill="#f7f8f4" />
      <rect x="239" y="292" width="34" height="48" rx="9" fill="#0f9f7a" />
    </svg>
  );
}
