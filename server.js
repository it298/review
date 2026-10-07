import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { createApp } from './cloud/app.js';

const required=['SUPABASE_URL','APP_PASSWORD','CRON_SECRET'];
const missing=required.filter(key=>!process.env[key]);
if(!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SECRET_KEY');
if(missing.length) throw new Error('Missing environment variables: '+missing.join(', '));
if(process.env.APP_PASSWORD.length<16) throw new Error('APP_PASSWORD must have at least 16 characters.');
const port=Number(process.env.PORT || 10000);
if(!Number.isInteger(port) || port<0 || port>65535) throw new Error('Invalid PORT.');
const app=createApp({staticDirectory:fileURLToPath(new URL('./frontend/dist/',import.meta.url))});
const server=app.listen(port,'0.0.0.0',()=>console.log('Review Tracker listening on port '+server.address().port));
function shutdown(){
  console.log('Finishing requests before shutdown.');
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),10000).unref();
}
process.once('SIGTERM',shutdown);
process.once('SIGINT',shutdown);
