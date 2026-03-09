// Supabase Edge Function: list-blitz-questions
// Returns blitz question pool rows (category, difficulty_score, question_text, answer, created_at).
// Invoke: GET/POST https://<project>.supabase.co/functions/v1/list-blitz-questions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc("get_blitz_questions_list");

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rows = (data ?? []) as Array<{
      category: string;
      difficulty_score: number;
      question_text: string;
      answer: string;
      created_at: string;
      id: string;
    }>;

    const accept = req.headers.get("accept") ?? "";

    if (accept.includes("application/json")) {
      return new Response(JSON.stringify({ questions: rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Plain text: one line per question
    const lines = rows.map(
      (r) =>
        `[${r.category}/${r.difficulty_score}] ${r.question_text ?? ""} → ${r.answer ?? ""} (${r.created_at ?? ""})`
    );
    return new Response(lines.join("\n"), {
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
