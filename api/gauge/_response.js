export const NO_STORE = 'no-store, max-age=0';

export function sendJson(res, status, body){
  res.setHeader('Cache-Control', NO_STORE);
  return res.status(status).json(body);
}
