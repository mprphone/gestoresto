export function actorFromRequest(req) {
  return {
    userId: req.header('x-user-id') || null,
    actorName: req.header('x-actor-name') || 'Sistema'
  };
}

export async function audit(client, req, action, entityTable, entityId, beforeData, afterData) {
  const actor = actorFromRequest(req);
  await client.query(`
    insert into audit_log (user_id, actor_name, action, entity_table, entity_id, before_data, after_data)
    values ($1, $2, $3, $4, $5, $6, $7)
  `, [
    actor.userId,
    actor.actorName,
    action,
    entityTable,
    entityId ? String(entityId) : null,
    beforeData ? JSON.stringify(beforeData) : null,
    afterData ? JSON.stringify(afterData) : null
  ]);
}
