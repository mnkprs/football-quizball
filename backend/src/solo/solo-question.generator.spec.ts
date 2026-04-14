import { SoloQuestionGenerator } from './solo-question.generator';

describe('SoloQuestionGenerator — analytics tags', () => {
  it('passes analytics_tags through when LLM returns them', () => {
    const llmRaw = {
      question_text: 'Who won UCL 2012?',
      correct_answer: 'Chelsea',
      explanation: 'Munich final.',
      difficulty_factor: 0.7,
      analytics_tags: {
        league_tier: 1,
        competition_type: 'continental_club',
        era: '2010s',
        event_year: 2012,
      },
    };

    const result = SoloQuestionGenerator.mapLlmOutputToQuestion(llmRaw, 'silver');

    expect(result.analytics_tags).toEqual({
      league_tier: 1,
      competition_type: 'continental_club',
      era: '2010s',
      event_year: 2012,
    });
  });

  it('tolerates missing analytics_tags (returns undefined)', () => {
    const llmRaw = {
      question_text: 'Q',
      correct_answer: 'A',
      explanation: 'E',
      difficulty_factor: 0.5,
    };
    const result = SoloQuestionGenerator.mapLlmOutputToQuestion(llmRaw, 'silver');
    expect(result.analytics_tags).toBeUndefined();
  });
});
