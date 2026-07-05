import {endSession} from '../_lib.js';
import {getKv} from '../_kv.js';

export default async function handler(req, res){
  try{
    if(req.method !== 'POST') return res.status(405).json({error: 'POST only'});
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const out = await endSession(getKv(), req.query.id, body);
    res.status(out.status).json(out.body);
  }catch(e){ res.status(500).json({error: 'relay error'}); }
}
