import { Injectable, signal, computed } from '@angular/core';

export type Language = 'en' | 'el';

const TRANSLATIONS = {
  en: {
    // Setup
    subtitle: 'Football trivia for 2 players',
    enterNames: 'Enter Player Names',
    player1Placeholder: 'Player 1 name...',
    player2Placeholder: 'Player 2 name...',
    kickOff: 'Kick Off! ⚽',
    howToPlay: '5 categories · 3 difficulties · 1 lifeline each',
    failedToStart: 'Failed to start game. Please try again.',
    // Board
    turn: 'Turn',
    end: 'End',
    endGameConfirm: 'End the game?',
    use2x: 'USE 2x',
    armed2x: '2x ARMED',
    // Question
    yourTurn: "'s turn",
    typeAnswer: 'Type your answer...',
    submit: 'Submit',
    higher: '▲ Higher',
    lower: '▼ Lower',
    clubName: 'Club name...',
    playerName: 'Player name...',
    scorePlaceholder: 'Score e.g. 2-1',
    guess: 'Guess',
    typePlayer: 'Type a player name...',
    use5050: '🎯 Use 50-50 (reduces to 1 pt)',
    fiftyPick: '🎯 50-50 — Pick one (1 pt if correct)',
    doubleArmed: '2x ARMED — double points if correct!',
    found: '/5 found',
    lives: 'Lives:',
    notInTop5Label: 'Not in top 5',
    notInTop5: '✗ not in top 5',
    stopEarly: 'Stop now — take 1pt (missing 1 answer)',
    allFound: '🏆 All 5 found! Full points!',
    stoppedEarly: '✅ Stopped at 4/5 — 1pt awarded',
    questionLost: '💀 Question lost — too many wrong guesses',
    oneWrong: '⚠️ 1 wrong guess — one more and the question is lost!',
    answersInEnglish: '',
    home: 'Home',
    away: 'Away',
    // Category labels
    catHistory: 'HISTORY',
    catPlayerId: 'PLAYER ID',
    catLogoQuiz: 'LOGO QUIZ',
    catHigherLower: 'HIGHER / LOWER',
    catGuessScore: 'GUESS THE SCORE',
    catGeography: 'GEOGRAPHY',
    catGossip: 'GOSSIP',
    catTop5: 'TOP 5',
    // Category labels (question view)
    catHistoryQ: 'History',
    catPlayerIdQ: 'Player ID',
    catLogoQuizQ: 'Logo Quiz',
    catHigherLowerQ: 'Higher or Lower',
    catGuessScoreQ: 'Guess the Score',
    catGeographyQ: 'Geography',
    catGossipQ: 'Gossip',
    catTop5Q: 'Top 5',
    // Result
    correct: 'Correct!',
    wrong: 'Wrong!',
    noPoints: 'No points awarded',
    correctAnswer: 'Correct Answer',
    markCorrect: '✓ Mark Correct',
    markWrong: '✗ Mark Wrong',
    seeFinal: 'See Final Results →',
    backToBoard: 'Back to Board →',
    // Results
    finalResults: 'Final Results',
    gameComplete: 'Football QuizBall Complete!',
    itsDraw: "🤝 It's a Draw!",
    wins: 'wins!',
    points: 'points',
    lifelineUsed: 'Lifeline: Used',
    lifelineNotUsed: 'Lifeline: Not used',
    categoryBreakdown: 'Category Breakdown',
    playAgain: 'Play Again ⚽',
  },
  el: {
    // Setup
    subtitle: 'Ποδοσφαιρικό κουίζ για 2 παίκτες',
    enterNames: 'Εισάγετε Ονόματα Παικτών',
    player1Placeholder: 'Όνομα Παίκτη 1...',
    player2Placeholder: 'Όνομα Παίκτη 2...',
    kickOff: 'Έναρξη! ⚽',
    howToPlay: '5 κατηγορίες · 3 επίπεδα · 1 βοήθεια ο καθένας',
    failedToStart: 'Αποτυχία εκκίνησης. Παρακαλώ δοκιμάστε ξανά.',
    // Board
    turn: 'Σειρά',
    end: 'Τέλος',
    endGameConfirm: 'Τερματισμός παιχνιδιού;',
    use2x: '2x',
    armed2x: '2x ΕΤΟΙΜΟ',
    // Question
    yourTurn: " η σειρά",
    typeAnswer: 'Πληκτρολογήστε απάντηση...',
    submit: 'Υποβολή',
    higher: '▲ Ψηλότερα',
    lower: '▼ Χαμηλότερα',
    clubName: 'Όνομα ομάδας...',
    playerName: 'Όνομα παίκτη...',
    scorePlaceholder: 'Σκορ π.χ. 2-1',
    guess: 'Εικασία',
    typePlayer: 'Πληκτρολογήστε παίκτη...',
    use5050: '🎯 Χρήση 50-50 (μειώνει σε 1 βαθμό)',
    fiftyPick: '🎯 50-50 — Επέλεξε (1 βαθμός αν σωστό)',
    doubleArmed: '2x ΕΤΟΙΜΟ — διπλοί βαθμοί αν σωστό!',
    found: '/5 βρέθηκαν',
    lives: 'Ζωές:',
    notInTop5Label: 'Εκτός top 5',
    notInTop5: '✗ εκτός top 5',
    stopEarly: 'Σταμάτα — πάρε 1 βαθμό (λείπει 1)',
    allFound: '🏆 5/5 βρέθηκαν! Πλήρεις βαθμοί!',
    stoppedEarly: '✅ Σταμάτησες στο 4/5 — 1 βαθμός',
    questionLost: '💀 Χάθηκε η ερώτηση — πολλά λάθη',
    oneWrong: '⚠️ 1 λάθος — άλλο ένα και χάνεις!',
    answersInEnglish: '* Οι απαντήσεις πρέπει να είναι στα Αγγλικά',
    home: 'Γηπεδούχος',
    away: 'Φιλοξενούμενος',
    // Category labels (board)
    catHistory: 'ΙΣΤΟΡΙΑ',
    catPlayerId: 'ΠΑΙΚΤΗΣ',
    catLogoQuiz: 'ΛΟΓΟΤΥΠΑ',
    catHigherLower: 'ΨΗΛΟ / ΧΑΜΗΛΟ',
    catGuessScore: 'ΜΑΝΤΕΨΕ ΤΟ ΣΚΟΡ',
    catGeography: 'ΓΕΩΓΡΑΦΙΑ',
    catGossip: 'GOSSIP',
    catTop5: 'TOP 5',
    // Category labels (question view)
    catHistoryQ: 'Ιστορία',
    catPlayerIdQ: 'Παίκτης',
    catLogoQuizQ: 'Λογότυπα',
    catHigherLowerQ: 'Ψηλό ή Χαμηλό',
    catGuessScoreQ: 'Μάντεψε το Σκορ',
    catGeographyQ: 'Γεωγραφία',
    catGossipQ: 'Gossip',
    catTop5Q: 'Top 5',
    // Result
    correct: 'Σωστό!',
    wrong: 'Λάθος!',
    noPoints: 'Κανένας βαθμός',
    correctAnswer: 'Σωστή Απάντηση',
    markCorrect: '✓ Σωστό',
    markWrong: '✗ Λάθος',
    seeFinal: 'Τελικά Αποτελέσματα →',
    backToBoard: 'Πίσω στο Ταμπλό →',
    // Results
    finalResults: 'Τελικά Αποτελέσματα',
    gameComplete: 'Ολοκλήρωση QuizBall!',
    itsDraw: '🤝 Ισοπαλία!',
    wins: 'κερδίζει!',
    points: 'βαθμοί',
    lifelineUsed: 'Βοήθεια: Χρησιμοποιήθηκε',
    lifelineNotUsed: 'Βοήθεια: Δεν χρησιμοποιήθηκε',
    categoryBreakdown: 'Ανάλυση Κατηγοριών',
    playAgain: 'Παίξε Ξανά ⚽',
  },
} as const;

type TranslationKeys = keyof typeof TRANSLATIONS.en;

const LANG_KEY = 'quizball_lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang = signal<Language>((localStorage.getItem(LANG_KEY) as Language) ?? 'en');

  readonly t = computed(() => TRANSLATIONS[this.lang()]);

  setLanguage(lang: Language): void {
    this.lang.set(lang);
    localStorage.setItem(LANG_KEY, lang);
  }

  toggle(): void {
    this.setLanguage(this.lang() === 'en' ? 'el' : 'en');
  }
}
