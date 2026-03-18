-- Atomically claims the current turn by checking current_player_id in the WHERE clause.
-- Returns true if the update happened (turn was valid), false if another request beat us.
CREATE OR REPLACE FUNCTION claim_online_turn(
  p_game_id        uuid,
  p_user_id        uuid,
  p_board_state    jsonb,
  p_player_scores  int[],
  p_player_meta    jsonb,
  p_new_player_id  uuid,
  p_new_status     text,
  p_turn_deadline  timestamptz,
  p_last_result    jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rows_updated int;
BEGIN
  UPDATE online_games
  SET
    board_state       = p_board_state,
    player_scores     = p_player_scores,
    player_meta       = p_player_meta,
    current_player_id = p_new_player_id,
    status            = p_new_status,
    turn_deadline     = p_turn_deadline,
    last_result       = p_last_result,
    updated_at        = now()
  WHERE id = p_game_id
    AND current_player_id = p_user_id
    AND status = 'active';

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;
