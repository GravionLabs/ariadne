import { TestBed } from '@angular/core/testing';
import { FileStorage, TextFile } from '../storage/file-storage';
import { CSHARP_IMPORTER } from './csharp-parser';
import { realImporter } from './real-importer.testing';
import { SagaImport } from './saga-import';
import order from '../../../../../samples/sagas/order/OrderStateMachine.cs';
import booking from '../../../../../samples/sagas/booking/BookingStateMachine.cs';

describe('SagaImport', () => {
  const files: TextFile[] = [
    { name: 'OrderStateMachine.cs', content: order },
    { name: 'BookingStateMachine.cs', content: booking },
  ];
  let load: ReturnType<typeof vi.fn>;
  let openFiles: ReturnType<typeof vi.fn>;
  let service: SagaImport;

  beforeEach(() => {
    load = vi.fn(realImporter);
    openFiles = vi.fn(async () => files);
    TestBed.configureTestingModule({
      providers: [
        { provide: FileStorage, useValue: { openFiles } },
        { provide: CSHARP_IMPORTER, useValue: load },
      ],
    });
    service = TestBed.inject(SagaImport);
  });

  it('asks for C# files, and is told when the user cancels', async () => {
    expect(await service.pick()).toBe(files);
    expect(openFiles).toHaveBeenCalledWith({ extensions: ['.cs'], description: 'C# source files' });
    openFiles.mockResolvedValueOnce(null);
    expect(await service.pick()).toBeNull();
  });

  it('finds the sagas in the files, in the browser’s environment', async () => {
    const result = await service.read(files);
    expect(result.sagas.map((s) => s.className)).toEqual([
      'OrderStateMachine',
      'BookingStateMachine',
    ]);
    const order = result.sagas[0].diagram;
    expect(order.nodes.map((n) => n.name)).toEqual([
      'Initial',
      'ReservingStock',
      'ChargingPayment',
      'Shipping',
      'Final',
    ]);
    // Where in the code: the file name the user picked.
    expect(result.sagas[0].locations.transitions['edge-1'].path).toBe('OrderStateMachine.cs');
    expect(
      result.warnings.some((w) => w.message.includes('nothing happens in a final state')),
    ).toBe(true);
  });

  it('loads the parser once, on first use, and not before', async () => {
    expect(load).not.toHaveBeenCalled();
    await service.read(files);
    await service.read(files);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries to load again after a failure', async () => {
    load.mockRejectedValueOnce(new Error('network down'));
    await expect(service.read(files)).rejects.toThrow('network down');
    const result = await service.read(files);
    expect(result.sagas).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('finds nothing in files without a saga, and says nothing', async () => {
    const result = await service.read([{ name: 'Plain.cs', content: 'class Plain {}' }]);
    expect(result).toEqual({ sagas: [], warnings: [] });
  });
});
