const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.database();
const now = () => Date.now();

function requireAuth(request) { if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.'); return request.auth.uid; }
async function access(uid, standId) { return (await db.ref(`userAccess/${uid}/${standId}`).get()).val() === true; }
async function role(uid) { return (await db.ref(`users/${uid}/role`).get()).val(); }
function validTargets(nodes, available) { return Array.isArray(nodes) && nodes.length && nodes.every(id => typeof id === 'string' && available[id]?.metadata?.enabled !== false); }
async function acquireLock(standId, operationId) {
  const ref = db.ref(`system/locks/stands/${standId}`); const result = await ref.transaction(lock => {
    if (lock && lock.expires_at > now()) return;
    return { operation_id: operationId, expires_at: now() + 20 * 60 * 1000 };
  });
  if (!result.committed) throw new HttpsError('failed-precondition', 'This stand already has an active operation.');
}
async function releaseLock(standId, operationId) {
  const ref = db.ref(`system/locks/stands/${standId}`); const lock = (await ref.get()).val();
  if (lock?.operation_id === operationId) await ref.remove();
}
function requestId(prefix) { return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 8)}`; }

exports.createIrrigationOperation = onCall(async request => {
  const uid = requireAuth(request); const { standId, targetNodes, waterLiters } = request.data || {};
  if (typeof standId !== 'string' || !await access(uid, standId)) throw new HttpsError('permission-denied', 'You do not have access to this stand.');
  if (!['admin', 'farm_manager'].includes(await role(uid))) throw new HttpsError('permission-denied', 'Your role cannot request irrigation.');
  if (!Number.isFinite(waterLiters) || waterLiters <= 0 || waterLiters > 100) throw new HttpsError('invalid-argument', 'Water quantity must be between 0 and 100 L per node.');
  const stand = (await db.ref(`stands/${standId}`).get()).val() || {};
  if (stand.controller?.online !== true) throw new HttpsError('failed-precondition', 'The stand controller is offline.');
  if (!validTargets(targetNodes, stand.nodes || {})) throw new HttpsError('invalid-argument', 'One or more target nodes are invalid or disabled.');
  const operationId = requestId('OP'), commandId = requestId('CMD'); await acquireLock(standId, operationId);
  const expiry = now() + 5 * 60 * 1000;
  const operation = { operation_id: operationId, command_id: commandId, type: 'IRRIGATE', stand_id: standId, target_nodes: targetNodes, water_liters: waterLiters, requested_by: uid, status: 'PENDING', created_at: now(), expires_at: expiry };
  const command = { ...operation, command_id: commandId, status: 'PENDING', queued_at: now() };
  try { await db.ref().update({ [`operations/${operationId}`]: operation, [`deviceCommands/standControllers/${standId}/${commandId}`]: command }); }
  catch (error) { await releaseLock(standId, operationId); throw error; }
  return { operationId, commandId, status: 'PENDING' };
});

exports.createFertigationOperation = onCall(async request => {
  const uid = requireAuth(request); const { standId, targetNodes, waterLiters, dosing } = request.data || {};
  if (!await access(uid, standId) || !['admin', 'farm_manager'].includes(await role(uid))) throw new HttpsError('permission-denied', 'You cannot request fertigation.');
  for (const dose of ['nitrogen_ml', 'phosphorus_ml', 'potassium_ml']) if (!Number.isFinite(dosing?.[dose]) || dosing[dose] < 0 || dosing[dose] > 1000) throw new HttpsError('invalid-argument', `Invalid ${dose}.`);
  if (!Number.isFinite(waterLiters) || waterLiters <= 0 || waterLiters > 100) throw new HttpsError('invalid-argument', 'Water quantity must be between 0 and 100 L.');
  const stand = (await db.ref(`stands/${standId}`).get()).val() || {}; if (stand.controller?.online !== true || !validTargets(targetNodes, stand.nodes || {})) throw new HttpsError('failed-precondition', 'Stand is unavailable or target is invalid.');
  const operationId=requestId('OP'),commandId=requestId('CMD'),expiry=now()+5*60*1000;await acquireLock(standId,operationId);
  const op={operation_id:operationId,command_id:commandId,type:'FERTIGATE',stand_id:standId,target_nodes:targetNodes,water_liters:waterLiters,dosing,requested_by:uid,status:'PENDING',created_at:now(),expires_at:expiry};
  try { await db.ref().update({[`operations/${operationId}`]:op,[`deviceCommands/standControllers/${standId}/${commandId}`]:{...op,queued_at:now()},[`deviceCommands/centralStation/${commandId}`]:{...op,queued_at:now()}}); } catch(e){await releaseLock(standId,operationId);throw e;} return {operationId,commandId,status:'PENDING'};
});

exports.syncCommandStatus = onValueWritten('/deviceCommands/standControllers/{standId}/{commandId}/status', async event => {
  const command = (await event.data.after.ref.parent.get()).val(); if (!command?.operation_id) return; const { standId } = event.params;
  const patch = { status: command.status, updated_at: now() }; for (const field of ['received_at','started_at','completed_at','error_code','error_message','delivered_liters']) if (command[field] !== undefined) patch[field]=command[field];
  await db.ref(`operations/${command.operation_id}`).update(patch);
  if (['COMPLETED','FAILED','CANCELLED'].includes(command.status)) await releaseLock(standId, command.operation_id);
});

exports.evaluateTelemetry = onValueWritten('/stands/{standId}/nodes/{nodeId}/current', async event => {
  const current=event.data.after.val();if(!current)return;const {standId,nodeId}=event.params,id=`LOW_MOISTURE_${standId}_${nodeId}`,ref=db.ref(`alerts/${id}`);
  if(current.valid!==true){await db.ref(`alerts/SENSOR_ERROR_${standId}_${nodeId}`).set({alert_id:`SENSOR_ERROR_${standId}_${nodeId}`,type:'SENSOR_ERROR',severity:'CRITICAL',stand_id:standId,node_id:nodeId,message:'Sensor communication failed.',resolved:false,created_at:now()});return;}
  const threshold=(await db.ref(`stands/${standId}/settings/thresholds/moisture_low`).get()).val() ?? 22;
  if(Number(current.moisture)<threshold) await ref.update({alert_id:id,type:'LOW_MOISTURE',severity:'WARNING',stand_id:standId,node_id:nodeId,message:'Soil moisture is below configured threshold.',value:current.moisture,resolved:false,created_at:now()}); else await ref.update({resolved:true,resolved_at:now()});
});

exports.detectOfflineControllers = onSchedule('every 5 minutes', async () => { const stands=(await db.ref('stands').get()).val()||{}; await Promise.all(Object.entries(stands).map(([id,s])=>{const c=s.controller||{};return db.ref(`alerts/CONTROLLER_OFFLINE_${id}`).update({alert_id:`CONTROLLER_OFFLINE_${id}`,type:'CONTROLLER_OFFLINE',severity:'CRITICAL',stand_id:id,message:'Controller has not checked in for three minutes.',resolved:!!(c.last_seen&&now()-c.last_seen<=180000),updated_at:now()})}));logger.info('Controller scan complete'); });
