import { Component } from '@angular/core';
import { FFlowModule } from '@foblex/flow';

@Component({
  imports: [FFlowModule],
  selector: 'app-editor',
  styleUrl: './editor.scss',
  templateUrl: './editor.html',
})
export class Editor {}
