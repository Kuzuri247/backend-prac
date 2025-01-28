"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [recipientName, setRecipientName] = useState("");
  const [emailPurpose, setEmailPurpose] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/generate-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientName,
          emailPurpose,
          keyPoints,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate email");
      }

      setGeneratedEmail(data.email);
      toast({
        title: "Email Generated",
        description: "Your email template has been generated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8 font-mono">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <Mail className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-3xl font-bold text-gray-900">
            Professional Email Generator
          </h1>
          <p className="mt-2 text-gray-600">
            Generate professional email templates in seconds
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="recipientName">Recipient Name</Label>
                <Input
                  id="recipientName"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="John Doe"
                  required
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailPurpose">Email Purpose</Label>
                <Select
                  value={emailPurpose}
                  onValueChange={setEmailPurpose}
                  required
                >
                  <SelectTrigger className="font-mono">
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting-request">Meeting Request</SelectItem>
                    <SelectItem value="follow-up">Follow Up</SelectItem>
                    <SelectItem value="thank-you">Thank You</SelectItem>
                    <SelectItem value="introduction">Introduction</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="keyPoints">Key Points</Label>
                <Textarea
                  id="keyPoints"
                  value={keyPoints}
                  onChange={(e) => setKeyPoints(e.target.value)}
                  placeholder="Enter key points to include in the email..."
                  className="h-32 font-mono"
                  required
                />
              </div>

              <Button type="submit" className="w-full font-mono" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Email"
                )}
              </Button>
            </form>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Generated Email</h2>
            <div className="bg-white rounded-lg p-4 min-h-[300px] border font-mono">
              {generatedEmail ? (
                <div className="whitespace-pre-wrap">{generatedEmail}</div>
              ) : (
                <div className="text-gray-400 text-center mt-20">
                  Your generated email will appear here
                </div>
              )}
            </div>
            {generatedEmail && (
              <Button
                variant="outline"
                className="mt-4 w-full font-mono"
                onClick={() => {
                  navigator.clipboard.writeText(generatedEmail);
                  toast({
                    title: "Copied",
                    description: "Email template copied to clipboard",
                  });
                }}
              >
                Copy to Clipboard
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}