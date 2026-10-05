import { describeSample } from './sample-readme';

describe('describeSample', () => {
  it('takes the first heading and the first sentence of the paragraph after it', () => {
    expect(
      describeSample(
        '# Order fulfilment\n\nTakes an order to the door. It reserves stock first, then takes the payment.\n\n## The process\n\nMore.',
      ),
    ).toEqual({ title: 'Order fulfilment', description: 'Takes an order to the door.' });
  });

  it('keeps a paragraph of one sentence whole, also over several lines', () => {
    expect(
      describeSample(
        '# Trip booking\n\nBooks a trip from a flight,\na hotel and a car: and undoes it.\n',
      ),
    ).toEqual({
      title: 'Trip booking',
      description: 'Books a trip from a flight, a hotel and a car: and undoes it.',
    });
  });

  it('does not stop at a dot inside a word or number', () => {
    expect(
      describeSample('# A\n\nUses MassTransit 8.1 and Acme.Orders for the sagas. Then more.\n')
        .description,
    ).toBe('Uses MassTransit 8.1 and Acme.Orders for the sagas.');
  });

  it('gives plain text: links, code and emphasis lose their marks', () => {
    expect(
      describeSample(
        '# The `Order` **saga**\n\nSends [a command](x.md) with `Send` and _waits_.\n',
      ),
    ).toEqual({ title: 'The Order saga', description: 'Sends a command with Send and waits.' });
  });

  it('skips what is not a paragraph between the heading and the text', () => {
    expect(
      describeSample('# T\n\n- a list\n- of things\n\n| a | b |\n\nThe real text.\n').description,
    ).toBe('The real text.');
  });

  it('does not run past the next heading, and copes with Windows line ends', () => {
    expect(() => describeSample('# T\n\n## Next\n\nText.\n')).toThrow('no paragraph');
    expect(describeSample('# T\r\n\r\nOne.\r\n').description).toBe('One.');
  });

  it('refuses a README without a heading, so the app never shows a sample without a title', () => {
    expect(() => describeSample('Just text.\n')).toThrow('no heading');
    expect(() => describeSample('')).toThrow('no heading');
  });

  it('keeps a sentence that ends with a question or exclamation mark, or with no mark at all', () => {
    expect(describeSample('# T\n\nWhat now? Something.\n').description).toBe('What now?');
    expect(describeSample('# T\n\nNo full stop here\n').description).toBe('No full stop here');
  });
});
