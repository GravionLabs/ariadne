// Angular assets must live inside the project, so the sample saga is copied next to the app's
// other public files before a build or serve (the copies are not committed). The JSON copy stands
// in for the REST endpoint of a backend that answers with JSON.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';

const sample = '../../samples/sagas/order/OrderStateMachine.saga.yaml';
await mkdir('public', { recursive: true });
await copyFile(sample, 'public/order.saga.yaml');
await writeFile(
  'public/order.saga.json',
  `${JSON.stringify(parse(await readFile(sample, 'utf8')), null, 2)}\n`,
);
