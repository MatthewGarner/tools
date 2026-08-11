import {getSession} from '../_lib.js';
import {getKv} from '../_kv.js';
import {sendJson} from '../_response.js';

export default async function handler(req, res){
  try{
    if(req.method !== 'GET') return sendJson(res, 405, {error: 'GET only'});
    const out = await getSession(getKv(), req.query.id);
    return sendJson(res, out.status, out.body);
  }catch(e){ return sendJson(res, 500, {error: 'relay error'}); }
}
