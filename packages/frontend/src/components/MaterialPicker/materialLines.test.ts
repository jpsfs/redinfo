import { describe, expect, it } from 'vitest';
import { InventoryItemType, MaterialItem } from '@redinfo/shared';
import { findLine, removeLine, setLineQuantity, tapMaterialItem } from './materialLines';

const gloves: MaterialItem = {
  id: 'mat-gloves',
  namePt: 'Luvas',
  nameEn: 'Gloves',
  unit: 'pcs',
  type: InventoryItemType.COUNTABLE,
  notes: null,
  isFrequent: true,
  frequentOrder: 0,
  isDeleted: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const oxygen: MaterialItem = {
  ...gloves,
  id: 'mat-oxygen',
  namePt: 'Oxigénio',
  nameEn: 'Oxygen',
  type: InventoryItemType.UNLIMITED,
};

describe('tapMaterialItem', () => {
  it('adds a COUNTABLE item at quantity 1 on the first tap', () => {
    const lines = tapMaterialItem([], gloves);
    expect(lines).toEqual([{ materialItem: gloves, quantity: 1 }]);
  });

  it('adds 1 more on every following tap', () => {
    const lines = tapMaterialItem(tapMaterialItem([], gloves), gloves);
    expect(findLine(lines, gloves.id)?.quantity).toBe(2);
  });

  it('toggles an UNLIMITED item on, with no quantity', () => {
    const lines = tapMaterialItem([], oxygen);
    expect(lines).toEqual([{ materialItem: oxygen, quantity: null }]);
  });

  it('toggles an UNLIMITED item back off on a second tap', () => {
    const lines = tapMaterialItem(tapMaterialItem([], oxygen), oxygen);
    expect(lines).toEqual([]);
  });

  it('leaves other lines untouched', () => {
    const lines = tapMaterialItem([{ materialItem: oxygen, quantity: null }], gloves);
    expect(lines).toHaveLength(2);
    expect(findLine(lines, oxygen.id)?.quantity).toBeNull();
  });
});

describe('setLineQuantity', () => {
  it('sets an exact count', () => {
    const lines = setLineQuantity([{ materialItem: gloves, quantity: 1 }], gloves.id, 5);
    expect(findLine(lines, gloves.id)?.quantity).toBe(5);
  });

  it('floors at 1 rather than going to (or below) zero', () => {
    const lines = setLineQuantity([{ materialItem: gloves, quantity: 1 }], gloves.id, -3);
    expect(findLine(lines, gloves.id)?.quantity).toBe(1);
  });

  it('rounds a fractional value', () => {
    const lines = setLineQuantity([{ materialItem: gloves, quantity: 1 }], gloves.id, 2.6);
    expect(findLine(lines, gloves.id)?.quantity).toBe(3);
  });
});

describe('removeLine', () => {
  it('drops the line for that item and leaves the rest', () => {
    const lines = removeLine(
      [
        { materialItem: gloves, quantity: 2 },
        { materialItem: oxygen, quantity: null },
      ],
      gloves.id,
    );
    expect(lines).toEqual([{ materialItem: oxygen, quantity: null }]);
  });
});
