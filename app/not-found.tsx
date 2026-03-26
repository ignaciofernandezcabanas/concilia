import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0f1923" }}
    >
      <div className="text-center max-w-md px-6">
        <p className="text-[80px] font-bold" style={{ color: "#2a3f52" }}>
          404
        </p>
        <h1 className="text-xl font-semibold text-white mt-2">Página no encontrada</h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
          La página que buscas no existe o ha sido movida. Comprueba la URL o vuelve al inicio.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 px-6 py-2.5 rounded-lg text-white text-sm font-medium transition-colors"
          style={{ background: "#0d9488" }}
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
