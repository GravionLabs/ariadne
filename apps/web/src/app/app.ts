import { Component } from '@angular/core';
import { Editor } from './editor/editor';

@Component({
  imports: [Editor],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
