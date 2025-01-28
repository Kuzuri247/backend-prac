import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { recipientName, emailPurpose, keyPoints } = await req.json();

    // Log the incoming request data
    console.log("Received request with data:", {
      recipientName,
      emailPurpose,
      keyPoints,
    });

    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key is missing");
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Log that we have an API key (but don't log the key itself)
    console.log("OpenAI API key is present");

    const template = `Write a professional email with the following details:
    Recipient Name: {recipientName}
    Purpose: {emailPurpose}
    Key Points to Include: {keyPoints}
    
    The email should be professional, concise, and well-structured.`;

    const prompt = new PromptTemplate({
      template,
      inputVariables: ["recipientName", "emailPurpose", "keyPoints"],
    });

    const model = new OpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0.7,
      modelName: "gpt-4-1106-preview",
    });

    const formattedPrompt = await prompt.format({
      recipientName,
      emailPurpose,
      keyPoints,
    });

    console.log("Formatted prompt created, sending to OpenAI...");
    
    try {
      const response = await model.call(formattedPrompt);
      console.log("Received response from OpenAI");
      
      if (!response) {
        throw new Error("Empty response received from OpenAI");
      }
      
      return NextResponse.json({ email: response });
    } catch (openAIError: any) {
      console.error("OpenAI API Error:", openAIError);
      return NextResponse.json(
        { error: "OpenAI API error: " + openAIError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error generating email:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate email" },
      { status: 500 }
    );
  }
}