// Lint probe (ADR 0006): every line marked "probe:" breaks one Angular rule on purpose.
// lint-probe/check.mjs fails when oxlint (JS plugin) or ESLint (templates) stops reporting one of them.
// Not imported anywhere and ignored by the regular lint run.
import { Component, EventEmitter, NgModule, OnInit, Output } from '@angular/core';

@Component({
  selector: 'wrong-prefix', // probe: component-selector
  standalone: false, // probe: prefer-standalone
  templateUrl: './probe.html',
})
export class Probe implements OnInit {
  @Output() onSelect = new EventEmitter<string>(); // probe: no-output-on-prefix
  @Output() click = new EventEmitter<void>(); // probe: no-output-native

  ngOnInit(): void {} // probe: no-empty-lifecycle-method
}

@Component({
  selector: 'app-inline',
  template: '<p>inline</p>', // probe: component-max-inline-declarations
})
export class InlineProbe {}

@NgModule({ declarations: [Probe] })
export class ProbeModule {}
