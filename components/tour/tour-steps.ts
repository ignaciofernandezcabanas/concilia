export interface TourStep {
  id: string;
  path: string;
  selector: string;
  title: string;
  body: string;
  placement: "bottom" | "right" | "left" | "top";
  highlightPadding?: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard-kpis",
    path: "/",
    selector: "dashboard-kpis",
    title: "Tu resumen financiero",
    body: "Ingresos, gastos, EBITDA, cashflow y estado de la bandeja de conciliación. Actualizado en tiempo real con los datos de tu banco y ERP.",
    placement: "bottom",
    highlightPadding: 12,
  },
  {
    id: "conciliacion-table",
    path: "/conciliacion",
    selector: "conciliacion-table",
    title: "Conciliación automática",
    body: "El motor clasifica cada movimiento bancario, propone matches con facturas y asigna un score de confianza. Los items con alta confianza se auto-aprueban — tú solo revisas las excepciones.",
    placement: "bottom",
  },
  {
    id: "seguimientos-threads",
    path: "/seguimientos",
    selector: "seguimientos-list",
    title: "Seguimientos inteligentes",
    body: "El agente crea hilos de seguimiento automáticos: cobros impagados, documentos pendientes, discrepancias con proveedores. Tú apruebas antes de que se envíe cualquier email.",
    placement: "right",
  },
  {
    id: "tesoreria-forecast",
    path: "/tesoreria",
    selector: "tesoreria-chart",
    title: "Previsión de tesorería",
    body: "Proyección a 13 semanas basada en facturas pendientes, cuotas de deuda y patrones históricos. Detecta semanas con saldo negativo antes de que ocurran.",
    placement: "bottom",
  },
  {
    id: "consolidado-switcher",
    path: "/consolidado",
    selector: "context-switcher",
    title: "Multi-empresa y consolidado",
    body: "Cambia entre sociedades del grupo desde aquí. Activa la vista consolidada para ver PyG y Balance agregados con eliminaciones intercompañía automáticas.",
    placement: "right",
  },
];
