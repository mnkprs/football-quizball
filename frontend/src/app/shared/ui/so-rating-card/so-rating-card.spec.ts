import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SoRatingCardComponent } from './so-rating-card';

describe('SoRatingCardComponent', () => {
  let fixture: ComponentFixture<SoRatingCardComponent>;
  let component: SoRatingCardComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SoRatingCardComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(SoRatingCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Test');
  });

  describe('displayValue', () => {
    it('elo type renders the raw number', () => {
      fixture.componentRef.setInput('type', 'elo');
      fixture.componentRef.setInput('value', 1042);
      expect(component.displayValue()).toBe('1042');
    });

    it('record type renders W — L (em-dash, not hyphen)', () => {
      fixture.componentRef.setInput('type', 'record');
      fixture.componentRef.setInput('value', 8);
      fixture.componentRef.setInput('secondaryValue', 12);
      expect(component.displayValue()).toBe('8W — 12L');
    });

    it('record type with no secondaryValue defaults losses to 0', () => {
      fixture.componentRef.setInput('type', 'record');
      fixture.componentRef.setInput('value', 3);
      expect(component.displayValue()).toBe('3W — 0L');
    });
  });

  describe('winRateLabel', () => {
    it('elo type returns null (no win rate on ELO cards)', () => {
      fixture.componentRef.setInput('type', 'elo');
      fixture.componentRef.setInput('value', 1042);
      expect(component.winRateLabel()).toBeNull();
    });

    it('record type with 0 games returns "No games yet"', () => {
      fixture.componentRef.setInput('type', 'record');
      fixture.componentRef.setInput('value', 0);
      fixture.componentRef.setInput('secondaryValue', 0);
      expect(component.winRateLabel()).toBe('No games yet');
    });

    it('record type with wins computes rounded win-rate percentage', () => {
      fixture.componentRef.setInput('type', 'record');
      fixture.componentRef.setInput('value', 8);
      fixture.componentRef.setInput('secondaryValue', 12);
      // 8 / (8+12) = 40%
      expect(component.winRateLabel()).toBe('40% WIN RATE');
    });

    it('record type with only losses renders 0% WIN RATE (losses-only user)', () => {
      fixture.componentRef.setInput('type', 'record');
      fixture.componentRef.setInput('value', 0);
      fixture.componentRef.setInput('secondaryValue', 5);
      expect(component.winRateLabel()).toBe('0% WIN RATE');
    });

    it('record type with 100% wins renders 100% WIN RATE', () => {
      fixture.componentRef.setInput('type', 'record');
      fixture.componentRef.setInput('value', 10);
      fixture.componentRef.setInput('secondaryValue', 0);
      expect(component.winRateLabel()).toBe('100% WIN RATE');
    });
  });
});
