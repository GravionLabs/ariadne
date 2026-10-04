import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DraftStore } from './storage/draft-store';

/** Offers the unsaved edits of an earlier session (a crash, a closed tab, a reload) back. */
@Component({
  selector: 'app-draft-banner',
  imports: [DatePipe],
  templateUrl: './draft-banner.html',
  styleUrl: './draft-banner.scss',
})
export class DraftBanner {
  protected readonly drafts = inject(DraftStore);
}
