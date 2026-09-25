const ENGINE_LABELS: Record<string, string> = {
  'browser-approx': 'Tarayıcı Yaklaşık Çözüm',
  pandapower: 'Yerel Tam Şebeke',
};

const CONVERGENCE_LABELS: Record<string, string> = {
  CONVERGED: 'Yakınsadı',
  NON_CONVERGED: 'Yakınsamadı',
  PARTIAL: 'Kısmi sonuç',
  NOT_RUN: 'Hesaplanmadı',
};

const VALIDATION_LABELS: Record<string, string> = {
  COMPLETE_UNVALIDATED: 'Bağımsız referansla doğrulanmadı',
  PARTIAL: 'Kısmi eşleme',
  VALIDATED: 'Doğrulandı',
};

export function calculationEngineLabel(engine: string): string {
  return ENGINE_LABELS[engine] ?? 'Bilinmeyen hesap motoru';
}

export function convergenceStatusLabel(status: string): string {
  return CONVERGENCE_LABELS[status] ?? 'Hesap durumu bilinmiyor';
}

export function validationStatusLabel(status: string): string {
  return VALIDATION_LABELS[status] ?? 'Doğrulama durumu bilinmiyor';
}

export function calculationHistoryText(metadata: {
  finishedAt: string;
  engine: string;
  engineVersion: string;
  mode: string;
  convergence: string;
  validation: string;
  elapsedMs: number;
}): string {
  const date = new Date(metadata.finishedAt).toLocaleString('tr-TR');
  const mode = metadata.mode === 'AC' ? 'AC yük akışı' : metadata.mode === 'DC' ? 'DC aktif güç akışı' : 'Analiz türü bilinmiyor';
  const elapsed = (metadata.elapsedMs / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  return `${date} · ${calculationEngineLabel(metadata.engine)} ${metadata.engineVersion} · ${mode} · ${convergenceStatusLabel(metadata.convergence)} · ${validationStatusLabel(metadata.validation)} · ${elapsed} s`;
}
