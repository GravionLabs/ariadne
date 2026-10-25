---
name: ng-test
description: 'Angular test rules with Vitest and TestBed (components, signals, mocking, async). Use when writing or running tests in Angular.'
---

## Prerequisites

- Project root with `angular.json`; Angular 21+ with standalone components
- Vitest, either via `vitest.config.ts` at the root (as set up by `ng-create-project`) or via the Angular CLI's built-in Vitest builder

## Test Runner

- **Framework**: Vitest for Angular v21+ (replaces Karma/Jasmine); Jest for Angular v20 and earlier
- **Run all**: `<pm> test` (package manager from `detect-techstack`); projects using the CLI builder without a config file run `ng test`
- **Run single**: `npx vitest run <path>`, or `ng test --include <path>` with the CLI builder
- **Targeted run** (per commit): `npx vitest run <paths>` for the spec files of the changed paths, or `ng test --include <path>` with the CLI builder; unknown mapping: the project's fast/unit script, never the full suite

## Component Testing

```typescript
import { TestBed } from '@angular/core/testing';
import { MyComponent } from './my.component';

describe('MyComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [MyComponent] }));

  it('renders with input', () => {
    const fixture = TestBed.createComponent(MyComponent);
    fixture.componentRef.setInput('value', 'test');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('test');
  });
});
```

## Signal Testing

```typescript
import { TestBed } from '@angular/core/testing';
import { MyService } from './my.service';

it('updates signal on action', () => {
  const service = TestBed.inject(MyService);
  service.updateValue('new');
  expect(service.value()).toBe('new');
});
```

## Service Mocking

```typescript
TestBed.configureTestingModule({
  providers: [
    { provide: MyService, useValue: mockService }
  ]
});
```

## TestBed rules

- `TestBed.configureTestingModule()` for component/service wiring; one `describe` per component/service
- Use `fixture.debugElement.query(By.css(...))` for DOM queries
- Call `fixture.detectChanges()` after state changes; `TestBed.flushEffects()` when testing signal effects; code that calls `inject()` needs `TestBed.runInInjectionContext`

## Gotchas

- Angular standalone components don't need `NgModule` wrapping
- Use `provideHttpClient(withFetch())` for HTTP testing
- Async operations: use `fakeAsync` + `tick()` or `waitForAsync`
- Set signal inputs with `fixture.componentRef.setInput('name', value)`
