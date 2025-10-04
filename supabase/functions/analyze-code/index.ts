import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Analyzing code for vulnerabilities...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert security analyst specializing in code vulnerability detection. Analyze the provided code for security issues and return a JSON array of vulnerabilities.

Each vulnerability should have:
- severity: "critical" | "high" | "medium" | "low" | "info"
- title: Brief title of the issue
- description: Clear explanation of the security problem
- recommendation: Specific steps to fix it

Common issues to check:
- SQL Injection vulnerabilities
- Cross-Site Scripting (XSS)
- Exposed API keys/secrets
- Insecure authentication
- Use of eval() or dangerous functions
- Inadequate input validation
- Weak cryptography
- Missing access controls

Return ONLY a valid JSON object with this structure:
{
  "vulnerabilities": [
    {
      "severity": "critical",
      "title": "SQL Injection",
      "description": "Description here",
      "recommendation": "Fix recommendation here"
    }
  ]
}

If no issues found, return:
{
  "vulnerabilities": [
    {
      "severity": "info",
      "title": "No Critical Issues Found",
      "description": "The code appears to follow basic security practices.",
      "recommendation": "Continue monitoring for emerging vulnerabilities."
    }
  ]
}`
          },
          {
            role: 'user',
            content: `Analyze this code for security vulnerabilities:\n\n${code}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_vulnerabilities",
              description: "Report security vulnerabilities found in code",
              parameters: {
                type: "object",
                properties: {
                  vulnerabilities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        severity: {
                          type: "string",
                          enum: ["critical", "high", "medium", "low", "info"]
                        },
                        title: { type: "string" },
                        description: { type: "string" },
                        recommendation: { type: "string" }
                      },
                      required: ["severity", "title", "description", "recommendation"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["vulnerabilities"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "report_vulnerabilities" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');
    
    // Extract vulnerabilities from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const vulnerabilities = toolCall?.function?.arguments 
      ? JSON.parse(toolCall.function.arguments).vulnerabilities 
      : [];

    return new Response(
      JSON.stringify({ vulnerabilities }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-code function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
