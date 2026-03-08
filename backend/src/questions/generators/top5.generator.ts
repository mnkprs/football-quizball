import { Injectable } from '@nestjs/common';
import { GeneratedQuestion, Top5Entry, DifficultyFactors } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface Top5Seed {
  question_text: string;
  top5: Top5Entry[];
  difficulty_factors: DifficultyFactors;
}

const SEED_BANK: Top5Seed[] = [
  {
    question_text: 'Name the top 5 Premier League all-time top goalscorers',
    top5: [
      { name: 'Alan Shearer', stat: '260 goals' },
      { name: 'Wayne Rooney', stat: '208 goals' },
      { name: 'Andrew Cole', stat: '187 goals' },
      { name: 'Frank Lampard', stat: '177 goals' },
      { name: 'Thierry Henry', stat: '175 goals' },
    ],
    difficulty_factors: { event_year: 2024, competition: 'Premier League', fame_score: 8 },
  },
  {
    question_text: 'Name the top 5 Champions League all-time top goalscorers',
    top5: [
      { name: 'Cristiano Ronaldo', stat: '140 goals' },
      { name: 'Lionel Messi', stat: '129 goals' },
      { name: 'Robert Lewandowski', stat: '101 goals' },
      { name: 'Karim Benzema', stat: '90 goals' },
      { name: 'Raul', stat: '71 goals' },
    ],
    difficulty_factors: { event_year: 2024, competition: 'UEFA Champions League', fame_score: 9 },
  },
  {
    question_text: 'Name the top 5 FIFA World Cup all-time top goalscorers',
    top5: [
      { name: 'Miroslav Klose', stat: '16 goals' },
      { name: 'Ronaldo', stat: '15 goals' },
      { name: 'Gerd Müller', stat: '14 goals' },
      { name: 'Just Fontaine', stat: '13 goals' },
      { name: 'Pelé', stat: '12 goals' },
    ],
    difficulty_factors: { event_year: 2022, competition: 'FIFA World Cup', fame_score: 9 },
  },
  {
    question_text: 'Name the top 5 countries with most FIFA World Cup wins',
    top5: [
      { name: 'Brazil', stat: '5 titles' },
      { name: 'Germany', stat: '4 titles' },
      { name: 'Italy', stat: '4 titles' },
      { name: 'Argentina', stat: '3 titles' },
      { name: 'France', stat: '2 titles' },
    ],
    difficulty_factors: { event_year: 2022, competition: 'FIFA World Cup', fame_score: 9 },
  },
  {
    question_text: 'Name the top 5 players with most La Liga goals all time',
    top5: [
      { name: 'Lionel Messi', stat: '474 goals' },
      { name: 'Cristiano Ronaldo', stat: '311 goals' },
      { name: 'Telmo Zarra', stat: '251 goals' },
      { name: 'Hugo Sánchez', stat: '234 goals' },
      { name: 'Raul', stat: '228 goals' },
    ],
    difficulty_factors: { event_year: 2021, competition: 'La Liga', fame_score: 6 },
  },
  {
    question_text: 'Name the top 5 most capped England international players of all time',
    top5: [
      { name: 'Peter Shilton', stat: '125 caps' },
      { name: 'Wayne Rooney', stat: '120 caps' },
      { name: 'David Beckham', stat: '115 caps' },
      { name: 'Steven Gerrard', stat: '114 caps' },
      { name: 'Bobby Moore', stat: '108 caps' },
    ],
    difficulty_factors: { event_year: 2023, competition: 'Premier League', fame_score: 5 },
  },
  {
    question_text: 'Name the top 5 clubs with most UEFA Champions League titles',
    top5: [
      { name: 'Real Madrid', stat: '15 titles' },
      { name: 'AC Milan', stat: '7 titles' },
      { name: 'Liverpool', stat: '6 titles' },
      { name: 'Bayern Munich', stat: '6 titles' },
      { name: 'Barcelona', stat: '5 titles' },
    ],
    difficulty_factors: { event_year: 2024, competition: 'UEFA Champions League', fame_score: 8 },
  },
  {
    question_text: 'Name the top 5 most expensive football transfers of all time',
    top5: [
      { name: 'Neymar', stat: '£198m (PSG 2017)' },
      { name: 'Kylian Mbappé', stat: '£166m (Real Madrid 2024)' },
      { name: 'João Félix', stat: '£113m (Atlético 2019)' },
      { name: 'Antoine Griezmann', stat: '£107m (Barcelona 2019)' },
      { name: 'Jack Grealish', stat: '£100m (Man City 2021)' },
    ],
    difficulty_factors: { event_year: 2024, competition: 'Premier League', fame_score: 7 },
  },
  {
    question_text: 'Name the top 5 Bundesliga all-time top goalscorers',
    top5: [
      { name: 'Gerd Müller', stat: '365 goals' },
      { name: 'Robert Lewandowski', stat: '312 goals' },
      { name: 'Klaus Fischer', stat: '268 goals' },
      { name: 'Jupp Heynckes', stat: '220 goals' },
      { name: 'Manfred Burgsmüller', stat: '213 goals' },
    ],
    difficulty_factors: { event_year: 2023, competition: 'Bundesliga', fame_score: 3 },
  },
  {
    question_text: 'Name the top 5 Serie A all-time top goalscorers',
    top5: [
      { name: 'Silvio Piola', stat: '274 goals' },
      { name: 'Francesco Totti', stat: '250 goals' },
      { name: 'Gunnar Nordahl', stat: '225 goals' },
      { name: 'José Altafini', stat: '216 goals' },
      { name: 'Roberto Baggio', stat: '205 goals' },
    ],
    difficulty_factors: { event_year: 2023, competition: 'Serie A', fame_score: 2 },
  },
  {
    question_text: 'Name the top 5 players with most Champions League appearances',
    top5: [
      { name: 'Cristiano Ronaldo', stat: '183 apps' },
      { name: 'Iker Casillas', stat: '177 apps' },
      { name: 'Xavi', stat: '157 apps' },
      { name: 'Raul', stat: '142 apps' },
      { name: 'Ryan Giggs', stat: '141 apps' },
    ],
    difficulty_factors: { event_year: 2023, competition: 'UEFA Champions League', fame_score: 2 },
  },
  {
    question_text: 'Name the top 5 most capped international players of all time (any nation)',
    top5: [
      { name: 'Bader Al-Mutawa', stat: '196 caps (Kuwait)' },
      { name: 'Cristiano Ronaldo', stat: '217 caps (Portugal)' },
      { name: 'Lionel Messi', stat: '191 caps (Argentina)' },
      { name: 'Ahmed Hassan', stat: '184 caps (Egypt)' },
      { name: 'Claudio Suárez', stat: '177 caps (Mexico)' },
    ],
    difficulty_factors: { event_year: 2023, competition: 'FIFA World Cup', fame_score: 1 },
  },
  {
    question_text: 'Name the top 5 clubs with most Premier League titles',
    top5: [
      { name: 'Manchester United', stat: '20 titles' },
      { name: 'Manchester City', stat: '10 titles' },
      { name: 'Arsenal', stat: '3 titles' },
      { name: 'Chelsea', stat: '6 titles' },
      { name: 'Liverpool', stat: '1 title' },
    ],
    difficulty_factors: { event_year: 2024, competition: 'Premier League', fame_score: 6 },
  },
];

@Injectable()
export class Top5Generator {
  generate(): GeneratedQuestion {
    const seed = SEED_BANK[Math.floor(Math.random() * SEED_BANK.length)];

    return {
      id: uuidv4(),
      category: 'TOP_5',
      difficulty: 'EASY',
      points: 1,
      question_text: seed.question_text,
      correct_answer: seed.top5.map((e) => e.name).join(', '),
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation: `The answers were: ${seed.top5.map((e, i) => `${i + 1}. ${e.name} (${e.stat})`).join(', ')}`,
      image_url: null,
      meta: { top5: seed.top5 },
      difficulty_factors: seed.difficulty_factors,
    };
  }
}
