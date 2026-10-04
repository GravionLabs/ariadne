import { Component } from '@angular/core';
import { Editor } from './editor/editor';
import { ErrorBanner } from './error-banner';

@Component({
  imports: [Editor, ErrorBanner],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
