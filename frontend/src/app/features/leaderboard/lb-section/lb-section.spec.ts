import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LbSectionComponent } from './lb-section';
import type { LeaderboardRow } from '../leaderboard-row';

function makeRow(rank: number, id: string, isMe = false): LeaderboardRow {
  return {
    id, rank,
    username: `user-${rank}`,
    score: 2000 - rank * 10,
    scoreLabel: 'ELO',
    tier: 'pro',
    meta: '',
    isMe,
  };
}

describe('LbSectionComponent — top-10 cap', () => {
  let fixture: ComponentFixture<LbSectionComponent>;
  let component: LbSectionComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LbSectionComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(LbSectionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('emptyMessage', 'empty');
  });

  it('listRows returns at most 7 rows after the podium when total rows >= 10', () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeRow(i + 1, `u${i + 1}`));
    fixture.componentRef.setInput('rows', rows);
    expect(component.listRows().length).toBe(7);
    expect(component.listRows()[0].rank).toBe(4);
    expect(component.listRows()[6].rank).toBe(10);
  });

  it('listRows falls back to rows when fewer than 3 (no podium)', () => {
    const rows = [makeRow(1, 'u1'), makeRow(2, 'u2')];
    fixture.componentRef.setInput('rows', rows);
    expect(component.listRows().length).toBe(2);
  });

  it('showMeBelow is true when me.rank > 10 even if backend included the row', () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow(i + 1, `u${i + 1}`));
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('meRow', makeRow(12, 'u12', true));
    expect(component.showMeBelow()).toBe(true);
  });

  it('showMeBelow is false when me is within the visible top 10', () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow(i + 1, `u${i + 1}`));
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('meRow', makeRow(5, 'u5', true));
    expect(component.showMeBelow()).toBe(false);
  });
});
