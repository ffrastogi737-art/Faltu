import { createApp } from './app.js';
import { migrate } from '../scripts/migrate.js';
import { realtime } from './realtime.js';

await migrate();
await realtime.start();
const port = Number(process.env.PORT) || 4000;
createApp().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`jewellery API on http://${process.env.HOST || '127.0.0.1'}:${port}`));
