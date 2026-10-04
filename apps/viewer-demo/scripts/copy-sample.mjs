// Angular assets must live inside the project, so the sample saga is copied next to the app's
// other public files before a build or serve (the copy is not committed).
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('public', { recursive: true });
await copyFile('../../samples/sagas/order/OrderStateMachine.saga.yaml', 'public/order.saga.yaml');
