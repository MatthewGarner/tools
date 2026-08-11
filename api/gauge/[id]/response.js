import {putResponse, clientIp} from '../_lib.js';
import {getKv} from '../_kv.js';
import {sendJson} from '../_response.js';

export default async function handler(req, res){
  try{
    if(req.method !== 'PUT') return sendJson(res, 405, {error: 'PUT only'});
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const out = await putResponse(getKv(), req.query.id, body, clientIp(req));
    return sendJson(res, out.status, out.body);
  }catch(e){ return sendJson(res, 500, {error: 'relay error'}); }
}
