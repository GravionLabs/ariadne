import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { BrowserFileStorage } from './storage/browser-file-storage';
import { FileStorage } from './storage/file-storage';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: FileStorage, useClass: BrowserFileStorage }],
    }).compileComponents();
  });

  it('renders the title and the editor canvas', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Ariadne');
    expect(el.querySelector('app-editor f-flow f-canvas')).toBeTruthy();
  });
});
