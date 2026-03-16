CREATE TABLE match_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid REFERENCES profiles(id),
  player2_id uuid,
  player1_username text NOT NULL,
  player2_username text NOT NULL,
  winner_id uuid,
  player1_score int NOT NULL,
  player2_score int NOT NULL,
  match_mode text DEFAULT 'local',
  played_at timestamptz DEFAULT now()
);
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players can read own matches" ON match_history
  FOR SELECT USING (auth.uid() = player1_id OR auth.uid() = player2_id);
