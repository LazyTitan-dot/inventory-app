import Link from 'next/link';
export default function NotFound() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Página no disponible</h1>
      <Link href="/catalogo">Volver al catálogo</Link>
    </main>
  );
}
