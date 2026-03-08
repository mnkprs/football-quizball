// Supabase Edge Function: seed-pool-stats
// Returns formatted seed pool stats (unanswered/answered per category and difficulty).
// Invoke: POST/GET https://<project>.supabase.co/functions/v1/seed-pool-stats

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

    const { data, error } = await supabase.rpc("get_seed_pool_stats");

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rows = (data ?? []) as Array<{
      category: string;
      difficulty: string;
      unanswered: number;
      answered: number;
    }>;

    const lines: string[] = [];

    for (const row of rows) {
      const label = `${row.category.replace(/_/g, " ")} / ${row.difficulty}`;
      lines.push(label);
      lines.push(`UNANSWERED: ${row.unanswered}`);
      lines.push(`ANSWERED: ${row.answered}`);
      lines.push("");
    }

    const text = lines.join("\n");
    const accept = req.headers.get("accept") ?? "";

    if (accept.includes("application/json")) {
      return new Response(JSON.stringify({ stats: data, formatted: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(text, {
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
