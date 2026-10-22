type MoneyData = {
  reported_loss_usd?: number | null;
  assets_reviewed_usd?: number | null;
  valuation_date?: string | null;
  amount_note?: string;
  reported_loss_valuation_date?: string | null;
  reported_loss_note?: string;
  assets_reviewed_valuation_date?: string | null;
  assets_reviewed_note?: string;
};

// Legacy shared valuation metadata remains a fallback for existing case files.
export function caseMoneyMetrics(metrics: MoneyData) {
  return [
    { field: 'reported_loss_usd', label: 'Reported loss', value: metrics.reported_loss_usd ?? null,
      valuationDate: metrics.reported_loss_valuation_date ?? metrics.valuation_date ?? null,
      note: metrics.reported_loss_note ?? metrics.amount_note },
    { field: 'assets_reviewed_usd', label: 'Assets reviewed', value: metrics.assets_reviewed_usd ?? null,
      valuationDate: metrics.assets_reviewed_valuation_date ?? metrics.valuation_date ?? null,
      note: metrics.assets_reviewed_note ?? metrics.amount_note },
  ];
}
