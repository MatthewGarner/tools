import {getSession} from '../_lib.js';
import {getKv} from '../_kv.js';

export default async function handler(req, res){
  try{
    if(req.method !== 'GET') return res.status(405).json({error: 'GET only'});
    const out = await getSession(getKv(), req.query.id);
    res.status(out.status).json(out.body);
  }catch(e){ res.status(500).json({error: 'relay error'}); }
}
