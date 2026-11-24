export function recordInventoryMovement(db, {
  inventoryId,
  itemName,
  movementType,
  quantityBefore,
  quantityAfter,
  unitBefore,
  unitAfter = unitBefore,
  referenceType = null,
  referenceId = null,
  note = '',
  actor = null,
  createdAt = new Date().toISOString(),
}) {
  const before = Number(quantityBefore);
  const after = Number(quantityAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    throw new Error('Inventory movements require finite before and after quantities.');
  }
  db.prepare(`INSERT INTO inventory_movements
    (inventory_id, item_name, movement_type, quantity_delta, quantity_before, quantity_after,
     unit_before, unit_after, reference_type, reference_id, note, actor_user_id, actor_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    inventoryId ?? null,
    String(itemName || 'Inventory item'),
    String(movementType),
    after - before,
    before,
    after,
    unitBefore || null,
    unitAfter || null,
    referenceType,
    referenceId == null ? null : String(referenceId),
    String(note || ''),
    actor?.id ?? null,
    actor?.name || actor?.username || (actor?.id == null ? 'System' : 'Staff'),
    createdAt,
  );
}
