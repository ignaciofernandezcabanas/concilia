# Concilia

Plataforma de conciliación bancaria automatizada para controllers financieros de PYMEs españolas.

Conecta tu ERP (Holded) con los movimientos bancarios, concilia transacciones automáticamente con IA, y genera reportes financieros (Balance, PyG, EFE) según el Plan General Contable español.

## Funcionalidades

- **Conciliación automática** con matching determinístico + Claude AI
- **Importación de movimientos** bancarios via CSV
- **Importación de facturas** en PDF (extracción de datos con IA)
- **Reportes PGC**: Balance de Situación, Pérdidas y Ganancias, Estado de Flujos de Efectivo
- **Sistema de aprendizaje**: reglas explícitas + patrones implícitos + creación via lenguaje natural
- **Integraciones**: Holded, Google Drive, Gmail (solo lectura)
- **Multi-usuario**: roles Admin, Editor, Reader

## Quick Start

```bash
git clone https://github.com/ignaciofernandezcabanas/concilia.git
cd concilia
cp .env.example .env   # Rellena con tus credenciales
npm install
npx prisma db push
npm run dev
```

Requiere: Node.js 18+, cuenta en [Supabase](https://supabase.com), API key de [Anthropic](https://console.anthropic.com).

## Documentación Técnica

Ver [CLAUDE.md](CLAUDE.md) para arquitectura, motor de conciliación, estructura de carpetas, y decisiones de diseño.

## Stack

Next.js 14 · TypeScript · Prisma · Supabase · Claude AI · Tailwind CSS
