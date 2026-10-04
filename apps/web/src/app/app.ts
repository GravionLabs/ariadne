import { Component } from '@angular/core';
import { DraftBanner } from './draft-banner';
import { Editor } from './editor/editor';
import { ErrorBanner } from './error-banner';

@Component({
  imports: [DraftBanner, Editor, ErrorBanner],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
