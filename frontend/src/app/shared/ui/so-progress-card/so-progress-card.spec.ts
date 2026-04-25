import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SoProgressCardComponent } from './so-progress-card';

describe('SoProgressCardComponent', () => {
  let fixture: ComponentFixture<SoProgressCardComponent>;
  let component: SoProgressCardComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SoProgressCardComponent] });
    fixture = TestBed.createComponent(SoProgressCardComponent);
    component = fixture.componentInstance;
  });

  function setTier(current = 1042, next = 1300, start = 1000): void {
    fixture.componentRef.setInput('mode', 'tier');
    fixture.componentRef.setInput('currentName', 'Substitute');
    fixture.componentRef.setInput('nextName', 'Pro');
    fixture.componentRef.setInput('current', current);
    fixture.componentRef.setInput('next', next);
    fixture.componentRef.setInput('start', start);
  }

  function setLevel(current = 7281, next = 7636, start = 7000): void {
    fixture.componentRef.setInput('mode', 'level');
    fixture.componentRef.setInput('currentName', '17');
    fixture.componentRef.setInput('nextName', '18');
    fixture.componentRef.setInput('current', current);
    fixture.componentRef.setInput('next', next);
    fixture.componentRef.setInput('start', start);
  }

  describe('headLabel', () => {
    it('tier mode prefixes "Path to" without "Level"', () => {
      setTier();
      expect(component.headLabel()).toBe('Path to Pro');
    });

    it('level mode prefixes "Path to Level"', () => {
      setLevel();
      expect(component.headLabel()).toBe('Path to Level 18');
    });
  });

  describe('valueSuffix', () => {
    it('tier mode has no suffix', () => {
      setTier();
      expect(component.valueSuffix()).toBe('');
    });

    it('level mode appends " XP"', () => {
      setLevel();
      expect(component.valueSuffix()).toBe(' XP');
    });
  });

  describe('currentLabel', () => {
    it('tier mode uppercases the raw name', () => {
      setTier();
      expect(component.currentLabel()).toBe('SUBSTITUTE');
    });

    it('level mode prefixes "LEVEL "', () => {
      setLevel();
      expect(component.currentLabel()).toBe('LEVEL 17');
    });
  });

  describe('nextLabel', () => {
    it('tier mode uppercases the raw name', () => {
      setTier();
      expect(component.nextLabel()).toBe('PRO');
    });

    it('level mode prefixes "LEVEL "', () => {
      setLevel();
      expect(component.nextLabel()).toBe('LEVEL 18');
    });
  });

  describe('remaining', () => {
    it('returns next - current when positive', () => {
      setTier(1042, 1300, 1000);
      expect(component.remaining()).toBe(258);
    });

    it('clamps to 0 when current exceeds next (over-cap edge case)', () => {
      setTier(1500, 1300, 1000);
      expect(component.remaining()).toBe(0);
    });
  });

  describe('pct', () => {
    it('returns proportional fill within the range', () => {
      // current=1100, range=1300-1000=300, filled=100, expected ~33.33%
      setTier(1100, 1300, 1000);
      expect(component.pct()).toBeCloseTo(33.33, 1);
    });

    it('returns 0 when range is 0 (next === start, division-by-zero guard)', () => {
      setTier(1000, 1000, 1000);
      expect(component.pct()).toBe(0);
    });

    it('clamps to 0 when current is below start', () => {
      setTier(800, 1300, 1000);
      expect(component.pct()).toBe(0);
    });

    it('clamps to 100 when current exceeds next', () => {
      setTier(1500, 1300, 1000);
      expect(component.pct()).toBe(100);
    });
  });
});
