import { describe, expect, it } from 'bun:test';
import { createQurbanOrderSchema } from '../../src/contracts/qurban';

const baseOrder = {
  hewanBatchId: 'BTH-001',
  jumlahSlotDiminta: 1,
  tipeKepemilikan: 'INDIVIDU' as const,
  akadWakalahAccepted: true,
};

describe('createQurbanOrderSchema — teleponPengqurban', () => {
  it('requires the field', () => {
    const result = createQurbanOrderSchema.safeParse(baseOrder);
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = createQurbanOrderSchema.safeParse({
      ...baseOrder,
      teleponPengqurban: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('normalizes a trunk-prefixed number to the canonical 62 form', () => {
    const result = createQurbanOrderSchema.safeParse({
      ...baseOrder,
      teleponPengqurban: '081211004001',
    });
    expect(result.success).toBe(true);
    expect(result.data?.teleponPengqurban).toBe('6281211004001');
  });

  it('normalizes a formatted +62 number to the canonical 62 form', () => {
    const result = createQurbanOrderSchema.safeParse({
      ...baseOrder,
      teleponPengqurban: '+62 812-1100-4001',
    });
    expect(result.success).toBe(true);
    expect(result.data?.teleponPengqurban).toBe('6281211004001');
  });

  it('rejects a landline number', () => {
    const result = createQurbanOrderSchema.safeParse({
      ...baseOrder,
      teleponPengqurban: '021-1234567',
    });
    expect(result.success).toBe(false);
  });

  it('rejects free text with a Bahasa Indonesia message', () => {
    const result = createQurbanOrderSchema.safeParse({
      ...baseOrder,
      teleponPengqurban: 'bukan nomor',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      'Format nomor WhatsApp tidak valid'
    );
  });

  it('rejects a non-Indonesian country code', () => {
    const result = createQurbanOrderSchema.safeParse({
      ...baseOrder,
      teleponPengqurban: '+1 415 555 0100',
    });
    expect(result.success).toBe(false);
  });
});
