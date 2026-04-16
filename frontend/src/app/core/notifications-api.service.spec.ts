import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { NotificationsApiService } from './notifications-api.service';
import { AuthService } from './auth.service';
import { NewsApiService, NewsMetadata } from './news-api.service';
import { DailyApiService, DailyMetadata } from './daily-api.service';

describe('NotificationsApiService — frontend-synthesized notification timestamps', () => {
  let service: NotificationsApiService;
  let newsApi: jasmine.SpyObj<NewsApiService>;
  let dailyApi: jasmine.SpyObj<DailyApiService>;

  beforeEach(() => {
    const newsSpy = jasmine.createSpyObj<NewsApiService>('NewsApiService', ['getMetadata']);
    const dailySpy = jasmine.createSpyObj<DailyApiService>('DailyApiService', ['getMetadata']);
    const authStub: Partial<AuthService> = { accessToken: signal<string | null>(null) };
    // Stub HttpClient so the backend notifications path resolves to [] instead of hanging.
    const httpStub: Partial<HttpClient> = {
      get: jasmine.createSpy('get').and.returnValue(of([])),
      patch: jasmine.createSpy('patch').and.returnValue(of(null)),
    };

    TestBed.configureTestingModule({
      providers: [
        NotificationsApiService,
        { provide: HttpClient, useValue: httpStub },
        { provide: NewsApiService, useValue: newsSpy },
        { provide: DailyApiService, useValue: dailySpy },
        { provide: AuthService, useValue: authStub },
      ],
    });

    service = TestBed.inject(NotificationsApiService);
    newsApi = TestBed.inject(NewsApiService) as jasmine.SpyObj<NewsApiService>;
    dailyApi = TestBed.inject(DailyApiService) as jasmine.SpyObj<DailyApiService>;

    // Daily metadata returns 0 by default so these tests focus on the news path.
    dailyApi.getMetadata.and.returnValue(of<DailyMetadata>({ count: 0, resetsAt: '', publishedAt: null }));
  });

  it('uses round_created_at as the news notification createdAt (happy path)', async () => {
    const publishedAt = '2026-04-16T01:00:00.000Z';
    const meta: NewsMetadata = {
      round_id: 'r1',
      questions_total: 5,
      questions_remaining: 5,
      expires_at: '2026-04-17T00:00:00.000Z',
      round_created_at: publishedAt,
      streak: 0,
      max_streak: 0,
    };
    newsApi.getMetadata.and.returnValue(of(meta));

    const all = await service.fetchNotifications();
    const news = all.find((n) => n.type === 'new_news_round');
    expect(news).toBeDefined();
    expect(news?.createdAt).toBe(publishedAt);
  });

  it('falls back to expires_at − 24h when round_created_at is null', async () => {
    const expiresAt = '2026-04-17T00:00:00.000Z';
    const expectedFallback = new Date(new Date(expiresAt).getTime() - 86_400_000).toISOString();
    const meta: NewsMetadata = {
      round_id: 'r1',
      questions_total: 5,
      questions_remaining: 5,
      expires_at: expiresAt,
      round_created_at: null,
      streak: 0,
      max_streak: 0,
    };
    newsApi.getMetadata.and.returnValue(of(meta));

    const all = await service.fetchNotifications();
    const news = all.find((n) => n.type === 'new_news_round');
    expect(news).toBeDefined();
    expect(news?.createdAt).toBe(expectedFallback);
  });
});
