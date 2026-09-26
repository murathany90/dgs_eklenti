import type { CanonicalShunt } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapShunts(ctx: DgsContext): CanonicalShunt[] {
  const result: CanonicalShunt[] = [];
  for (const row of ctx.rows('ElmShnt')) {
    const id = reference(row.FID); if (!id) continue;
    const bus = ctx.busFromCubic(row.bus1), type = numeric(row.shtype);
    const shuntType = type === 1 ? 'REACTOR' : type === 2 ? 'CAPACITOR' : 'UNKNOWN';
    const signed = (magnitude: number | null): number | null => magnitude === null ? null : type === 1 ? magnitude : type === 2 ? -magnitude : null;
    const steps = numeric(row.ncapx), currentStep = numeric(row.ncapa), usesTapTable = numeric(row.iTaps) === null ? null : numeric(row.iTaps) === 1;
    const tableRows = numeric(row['mTaps:SIZEROW']);
    const tapTableQmvar = tableRows !== null && Number.isInteger(tableRows) && tableRows >= 0
      ? Array.from({ length: tableRows }, (_, index) => numeric(row[`mTaps:${index}`])).filter((value): value is number => value !== null)
      : [];
    let qMvarPerStep: number | null = null, totalQAtCurrentStepMvar: number | null = null;
    if (usesTapTable === true) {
      const validShape = steps !== null && Number.isInteger(steps) && tableRows === steps + 1 && tapTableQmvar.length === tableRows;
      if (validShape && currentStep !== null && Number.isInteger(currentStep) && currentStep >= 0 && currentStep <= steps!) {
        totalQAtCurrentStepMvar = signed(tapTableQmvar[currentStep]!);
        const perStepAtCurrent = currentStep > 0 ? tapTableQmvar[currentStep]! / currentStep : null;
        const firstActive = tapTableQmvar.findIndex((value, index) => index > 0 && value !== 0);
        const perStepAtFirst = firstActive > 0 ? tapTableQmvar[firstActive]! / firstActive : null;
        qMvarPerStep = signed(perStepAtCurrent ?? perStepAtFirst);
      }
      if (!validShape) ctx.finding('SHUNT_TAP_TABLE_INCOMPLETE', 'WARNING', id, 'mTaps kademeleri eksik/eşleşmiyor; şönt Q solver girdisi yapılmadı');
      if (totalQAtCurrentStepMvar === null) ctx.finding('SHUNT_CURRENT_STEP_UNRESOLVED', 'WARNING', id, 'Aktif mTaps kademesinin toplam Q değeri çözümlenemedi');
      ctx.finding('SHUNT_TAP_TABLE_LOSS_DATA_UNAVAILABLE', 'INFO', id, 'DGS dışa aktarımında mTaps ikinci sütunundaki kalite/kayıp verisi yok');
    } else if (usesTapTable === false && steps === 1) {
      const magnitude = type === 1 ? numeric(row.qrean) : type === 2 ? numeric(row.qcapn) : null;
      qMvarPerStep = signed(magnitude);
      totalQAtCurrentStepMvar = qMvarPerStep !== null && currentStep !== null ? qMvarPerStep * currentStep : null;
    } else if (usesTapTable === false) {
      ctx.finding('SHUNT_PER_STEP_RATING_UNRESOLVED', 'WARNING', id, 'Birden çok kademe için mTaps tablosu yok; toplam anma Q değeri per-step olarak varsayılmadı');
    }
    if (!bus) ctx.finding('MISSING_SHUNT_BUS', 'ERROR', id, 'ElmShnt.bus1 çözümlenemedi');
    if (qMvarPerStep === null) ctx.finding('MISSING_SHUNT_Q', 'ERROR', id, 'Şönt reaktif güç alanı eksik veya tür desteklenmiyor');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmShnt', fid: id }, inService: inService(row.outserv),
      bus, nominalKv: numeric(row.ushnm), qMvarPerStep, totalQAtCurrentStepMvar, tapTableQmvar: tapTableQmvar.map(value => signed(value)!),
      tapTableLossDataAvailable: false, steps, currentStep, usesTapTable, shuntType });
  }
  return result;
}
