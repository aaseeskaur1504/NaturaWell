import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface Remedy {
  title: string;
  ingredients: string[];
  instructions: string[];
  benefits: string;
  precautions: string;
  dietaryRecommendations: string[];
}

export async function getNaturalRemedies(
  category: 'skin' | 'hair' | 'health',
  type: string,
  problems: string,
  photoDescription?: string
): Promise<Remedy[]> {
  const prompt = `
    You are a natural health and wellness expert specializing in traditional and herbal home remedies.
    Targeting: ${category}
    User Context: Type is ${type}. Problems: ${problems}. 
    ${photoDescription ? `Visual details from user photo: ${photoDescription}` : ''}
    
    Provide 3 high-quality natural home remedies and specific dietary advice (what to eat/drink to cure the problem internally).
    For each remedy, include:
    - Title
    - Natural ingredients
    - Instructions (step-by-step)
    - Why it works
    - Precautions
    - Dietary Recommendations (specific functional foods or drinks)
    
    Also provide 2 general health tips for ${category}.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
            instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
            benefits: { type: Type.STRING },
            precautions: { type: Type.STRING },
            dietaryRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "ingredients", "instructions", "dietaryRecommendations"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    return [];
  }
}

export interface BodyAdvice {
  bmiCategory: string;
  bodyFacts: string[];
  weightAdvice: string;
  heightAdvice: string;
  personalityHealthTips: string[];
}

export async function getBodyAdvice(
  age: number,
  height: number,
  weight: number,
  bmi: number,
  goals: string[]
): Promise<BodyAdvice> {
  const prompt = `
    You are a holistic health, fitness and personality development coach.
    User Profile:
    - Age: ${age}
    - Height: ${height} cm
    - Weight: ${weight} kg
    - Calculated BMI: ${bmi.toFixed(1)}
    - Wellness Goals: ${goals.join(', ')}

    Based on these metrics, provide:
    1. A short BMI category name (e.g., Underweight, Normal, Overweight).
    2. 3 fascinating scientific facts about the human body related to their age or metrics.
    3. Specific, natural advice on weight management (gain/loss/maintain) based on their BMI.
    4. Advice on posture, stretching or natural ways to maximize height potential (if applicable to age) or maintain spine health.
    5. 3 tips for better personality, confidence, and holistic mental health.

    Ensure all advice is natural, encouraging, and science-backed.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          bmiCategory: { type: Type.STRING },
          bodyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
          weightAdvice: { type: Type.STRING },
          heightAdvice: { type: Type.STRING },
          personalityHealthTips: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["bmiCategory", "bodyFacts", "weightAdvice", "heightAdvice", "personalityHealthTips"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Failed to parse Body Advice:", e);
    return {
      bmiCategory: "Checked",
      bodyFacts: ["Your body is amazing."],
      weightAdvice: "Focus on balanced nutrition.",
      heightAdvice: "Maintain good posture.",
      personalityHealthTips: ["Practice daily gratitude."]
    };
  }
}

export async function getGeneralHealthTips(): Promise<string[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "Provide 5 short, actionable natural health and wellness tips for daily life.",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });
  try {
    return JSON.parse(response.text || '[]');
  } catch (e) {
    return ["Stay hydrated", "Get 8 hours of sleep", "Eat whole foods"];
  }
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export async function sendMessageToAura(history: ChatMessage[], message: string): Promise<string> {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    history: history,
    config: {
      systemInstruction: `
        You are "Aura", a compassionate, calm, and supportive wellness companion. 
        Your goal is to help users navigate mood swings, anxiety, depression, and life stressors through calming advice and natural wellness perspectives.
        
        Guidelines:
        - Use a gentle, empathetic, and non-judgmental tone.
        - Suggest natural calming techniques: deep breathing, tea, nature walks, mindfulness, or herbal remedies (referencing the app's focus).
        - Use short, soothing sentences.
        - DO NOT provide medical diagnoses or prescriptions.
        - ALWAYS start with a supportive acknowledgment of the user's feelings.
        - If the user mentions self-harm or extreme crisis, immediately and gently suggest seeking professional help (helplines).
        - Keep the interaction focused on emotional well-developed and holistic peace.
      `,
    }
  });

  const response = await chat.sendMessage({
    message: message
  });

  return response.text || "I'm here for you. Take a deep breath.";
}
