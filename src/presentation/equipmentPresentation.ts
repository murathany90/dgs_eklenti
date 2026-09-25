export interface EquipmentPresentation {
  label: string; icon: string; category: string; identityLabel: string;
}

export const EQUIPMENT_PRESENTATION: Record<string, EquipmentPresentation> = {
  ElmSite: { label: 'Trafo Merkezi', icon: '⌂', category: 'Trafo Merkezleri', identityLabel: 'Trafo kimliği' },
  ElmSubstat: { label: 'Bara Grubu', icon: '▤', category: 'Baralar', identityLabel: 'Bara grubu kimliği' },
  ElmTerm: { label: 'Bara', icon: '━', category: 'Baralar', identityLabel: 'Bara kimliği' },
  ElmBay: { label: 'Fider', icon: '⌁', category: 'Anahtarlama Elemanları', identityLabel: 'Fider kimliği' },
  ElmLne: { label: 'Enerji İletim Hattı', icon: '↔', category: 'Hatlar', identityLabel: 'Hat kimliği' },
  ElmLnesec: { label: 'Hat Bölümü', icon: '↔', category: 'Hatlar', identityLabel: 'Hat bölümü kimliği' },
  ElmTr2: { label: 'Transformatör', icon: '⇅', category: 'Transformatörler', identityLabel: 'Trafo kimliği' },
  ElmSym: { label: 'Üretim Ünitesi', icon: '⚡', category: 'Üretim Üniteleri', identityLabel: 'Üretim ünitesi kimliği' },
  ElmGenStat: { label: 'Üretim Ünitesi', icon: '⚡', category: 'Üretim Üniteleri', identityLabel: 'Üretim ünitesi kimliği' },
  ElmLod: { label: 'Tüketim / Yük', icon: '⌂', category: 'Tüketimler', identityLabel: 'Tüketim kimliği' },
  ElmShnt: { label: 'Şönt Ekipman', icon: '∿', category: 'Şöntler', identityLabel: 'Ekipman kimliği' },
  ElmScap: { label: 'Seri Kompanzasyon', icon: '∿', category: 'Seri Kompanzasyon', identityLabel: 'Ekipman kimliği' },
  ElmXnet: { label: 'Dış Şebeke Kaynağı', icon: '⌖', category: 'Şebeke Kaynakları', identityLabel: 'Kaynak kimliği' },
  ElmCoup: { label: 'Kesici / Ayırıcı', icon: '⊗', category: 'Anahtarlama Elemanları', identityLabel: 'Anahtarlama kimliği' },
  ElmStactrl: { label: 'İstasyon Kontrolü', icon: '◎', category: 'Kontroller', identityLabel: 'Kontrol kimliği' },
  StaCubic: { label: 'Hücre / Bağlantı Noktası', icon: '▣', category: 'Anahtarlama Elemanları', identityLabel: 'Bağlantı kimliği' },
  StaSwitch: { label: 'Anahtarlama Elemanı', icon: '⊗', category: 'Anahtarlama Elemanları', identityLabel: 'Anahtarlama kimliği' },
  TypLne: { label: 'Hat Teknik Tipi', icon: '↔', category: 'Teknik Ayrıntılar', identityLabel: 'Tip kimliği' },
  TypTr2: { label: 'Trafo Teknik Tipi', icon: '⇅', category: 'Teknik Ayrıntılar', identityLabel: 'Tip kimliği' },
  TypSym: { label: 'Senkron Ünite Teknik Tipi', icon: '⚡', category: 'Teknik Ayrıntılar', identityLabel: 'Tip kimliği' },
  ElmNet: { label: 'Şebeke', icon: '⌖', category: 'Sistem', identityLabel: 'Şebeke kimliği' },
};

const FIELD_LABELS: Record<string, string> = {
  FID: 'Kimlik', loc_name: 'Ad', typ_id: 'Teknik tip', fold_id: 'Üst grup', bus1: 'Bağlantı noktası', bus2: 'İkinci bağlantı noktası',
  bushv: 'Yüksek gerilim bağlantısı', buslv: 'Alçak gerilim bağlantısı', pgini: 'Başlangıç aktif gücü', qgini: 'Başlangıç reaktif gücü',
  plini: 'Aktif tüketim', qlini: 'Reaktif tüketim', usetp: 'Gerilim ayarı', cQ_min: 'Alt reaktif güç sınırı', cQ_max: 'Üst reaktif güç sınırı',
  uknom: 'Nominal gerilim', utrn_h: 'Yüksek taraf nominal gerilimi', utrn_l: 'Alçak taraf nominal gerilimi', uktr: 'Kısa devre gerilim yüzdesi',
};

export function displayEquipmentType(powerFactoryClass: string): string {
  return EQUIPMENT_PRESENTATION[powerFactoryClass]?.label ?? powerFactoryClass;
}

export function equipmentIdentity(powerFactoryClass: string): string {
  return EQUIPMENT_PRESENTATION[powerFactoryClass]?.identityLabel ?? 'Ekipman kimliği';
}

export function primaryDisplayName(name: string | null | undefined, id: string): { primary: string; secondary: string } {
  return { primary: name?.trim() || id, secondary: id };
}

const ENUM_LABELS: Record<string, string> = {
  NON_CONVERGED: 'Yakınsamadı', CONVERGED: 'Yakınsadı', PARTIAL: 'Kısmi', FULL: 'Tam', COMPLETE: 'Tam',
  COMPLETE_UNVALIDATED: 'Doğrulanmadı', TRANSMISSION_REDUCED: 'İletim ağına indirgenmiş', BUS_BRANCH: 'Bara-kol gösterimi',
  NODE_BREAKER: 'Düğüm-kesici gösterimi', SUPPORTED: 'Motor destekliyor', UNSUPPORTED: 'Motor desteklemiyor',
  BrowserApproxSolver: 'Tarayıcı Yaklaşık Çözüm', 'Browser Approx.': 'Tarayıcı Yaklaşık Çözüm',
};

const replacements: Array<readonly [string, string]> = [
  ...Object.entries(EQUIPMENT_PRESENTATION).map(([code, item]) => [code, item.label] as const),
  ...Object.entries(FIELD_LABELS), ...Object.entries(ENUM_LABELS),
  ['Absolute Error', 'Mutlak Fark'], ['Relative Error', 'Göreli Fark'], ['PowerFactory Reference', 'PowerFactory Referansı'],
  ['System loss', 'Sistem Kaybı'], ['Generator', 'Üretim Ünitesi'], ['Bus', 'Bara'], ['Line', 'Hat'],
];
replacements.sort((a, b) => b[0].length - a[0].length);
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const replacementMap = new Map(replacements);
const replacementPattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${replacements.map(([value]) => escapeRegExp(value)).join('|')}|FID)(?![\\p{L}\\p{N}_])`, 'gu');

export function presentUserText(value: string): string {
  return value.replace(replacementPattern, token => token === 'FID' ? 'kimlik' : replacementMap.get(token) ?? token);
}
