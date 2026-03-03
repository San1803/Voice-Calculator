import React, { useState, useRef } from 'react';
import { Mic, MicOff, Loader2, Delete } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const Button = ({ children, onClick, className = '' }: { children: React.ReactNode, onClick: () => void, className?: string }) => (
  <button
    onClick={onClick}
    className={`h-16 flex items-center justify-center text-2xl font-medium rounded-xl transition-colors active:scale-95 ${
      className || 'bg-neutral-900 text-neutral-200 hover:bg-neutral-800'
    }`}
  >
    {children}
  </button>
);

export default function App() {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<string | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);
  const [voiceExpression, setVoiceExpression] = useState<string | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleNumber = (num: string) => {
    setVoiceExpression(null);
    if (waitingForNewValue) {
      setDisplay(num);
      setWaitingForNewValue(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleOperator = (op: string) => {
    setVoiceExpression(null);
    if (operator && !waitingForNewValue) {
      const result = performCalculation(prevValue!, display, operator);
      setDisplay(String(result));
      setPrevValue(String(result));
    } else {
      setPrevValue(display);
    }
    setOperator(op);
    setWaitingForNewValue(true);
  };

  const performCalculation = (a: string, b: string, op: string) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (isNaN(numA) || isNaN(numB)) return 0;
    let res = 0;
    switch (op) {
      case '+': res = numA + numB; break;
      case '-': res = numA - numB; break;
      case '*': res = numA * numB; break;
      case '/': res = numB !== 0 ? numA / numB : NaN; break;
      default: res = numB;
    }
    return Number.isInteger(res) ? res : parseFloat(res.toFixed(8));
  };

  const calculate = () => {
    if (operator && prevValue) {
      const result = performCalculation(prevValue, display, operator);
      setDisplay(Number.isNaN(result) ? 'Error' : String(result));
      setPrevValue(null);
      setOperator(null);
      setWaitingForNewValue(true);
    }
  };

  const clear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperator(null);
    setWaitingForNewValue(false);
    setVoiceExpression(null);
    setError(null);
  };

  const handleBackspace = () => {
    if (display === 'Error') {
      setDisplay('0');
      return;
    }
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const handlePercent = () => {
    if (display === 'Error') return;
    const val = parseFloat(display);
    if (!isNaN(val)) {
      setDisplay(String(val / 100));
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        setError(null);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            await processVoiceInput(base64data, mediaRecorder.mimeType);
          };
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access error:", err);
        setError("Microphone access denied. Please allow microphone permissions.");
      }
    }
  };

  const processVoiceInput = async (base64Audio: string, mimeType: string) => {
    setIsProcessing(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Audio,
                }
              },
              {
                text: "You are a voice calculator. Listen to the audio and solve the math problem. Return a JSON object with 'expression' (the parsed math expression, e.g. '15 * 80 / 100') and 'result' (the numerical result). If it's not a valid math problem or you cannot understand it, return an 'error' field with a brief explanation."
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              expression: { type: Type.STRING },
              result: { type: Type.NUMBER },
              error: { type: Type.STRING }
            }
          }
        }
      });

      const resultText = response.text;
      if (resultText) {
        const parsed = JSON.parse(resultText);
        if (parsed.error) {
          setError(parsed.error);
        } else if (parsed.expression && parsed.result !== undefined) {
          setVoiceExpression(`${parsed.expression} =`);
          setDisplay(String(parsed.result));
          setPrevValue(null);
          setOperator(null);
          setWaitingForNewValue(true);
        }
      }
    } catch (err) {
      console.error("Error processing voice:", err);
      setError("Failed to process voice input. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const expressionDisplay = operator && prevValue ? `${prevValue} ${operator.replace('*', '×').replace('/', '÷')}` : '';

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans text-neutral-100 selection:bg-indigo-500/30">
      <div className="w-full max-w-sm bg-neutral-900 rounded-3xl shadow-2xl overflow-hidden border border-neutral-800 flex flex-col">
        {/* Display Area */}
        <div className="p-6 pb-4 flex flex-col items-end justify-end h-48 bg-neutral-900 relative">
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-4 left-4 right-4 bg-red-500/10 text-red-400 text-xs p-3 rounded-xl border border-red-500/20 shadow-lg backdrop-blur-sm z-10"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="text-neutral-500 text-lg h-6 mb-1 font-mono tracking-wider truncate w-full text-right">
            {voiceExpression || expressionDisplay}
          </div>
          <div 
            className="text-6xl font-light tracking-tight truncate w-full text-right"
            style={{ fontSize: display.length > 8 ? '3rem' : '3.75rem' }}
          >
            {display}
          </div>
        </div>

        {/* Voice Button Area */}
        <div className="px-6 py-5 bg-neutral-800/30 flex justify-center items-center border-t border-b border-neutral-800/50">
          <button
            onClick={toggleRecording}
            disabled={isProcessing}
            className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 ${
              isRecording 
                ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] scale-110' 
                : isProcessing
                ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg hover:shadow-indigo-500/25'
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
            {isRecording && (
              <span className="absolute -inset-2 rounded-full border border-red-500 animate-ping opacity-75"></span>
            )}
          </button>
          <div className="ml-5 flex-1">
            <div className="text-sm font-medium text-neutral-200">
              {isRecording ? 'Listening...' : isProcessing ? 'Calculating...' : 'Tap to speak'}
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              e.g. "What is 15% of 80?"
            </div>
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-neutral-950">
          <Button onClick={clear} className="text-red-400 bg-neutral-900 hover:bg-neutral-800">AC</Button>
          <Button onClick={handleBackspace} className="text-indigo-400 bg-neutral-900 hover:bg-neutral-800"><Delete className="w-6 h-6 mx-auto" /></Button>
          <Button onClick={handlePercent} className="text-indigo-400 bg-neutral-900 hover:bg-neutral-800">%</Button>
          <Button onClick={() => handleOperator('/')} className="text-indigo-400 bg-neutral-900 hover:bg-neutral-800 text-3xl">÷</Button>

          <Button onClick={() => handleNumber('7')}>7</Button>
          <Button onClick={() => handleNumber('8')}>8</Button>
          <Button onClick={() => handleNumber('9')}>9</Button>
          <Button onClick={() => handleOperator('*')} className="text-indigo-400 bg-neutral-900 hover:bg-neutral-800 text-3xl">×</Button>

          <Button onClick={() => handleNumber('4')}>4</Button>
          <Button onClick={() => handleNumber('5')}>5</Button>
          <Button onClick={() => handleNumber('6')}>6</Button>
          <Button onClick={() => handleOperator('-')} className="text-indigo-400 bg-neutral-900 hover:bg-neutral-800 text-3xl">−</Button>

          <Button onClick={() => handleNumber('1')}>1</Button>
          <Button onClick={() => handleNumber('2')}>2</Button>
          <Button onClick={() => handleNumber('3')}>3</Button>
          <Button onClick={() => handleOperator('+')} className="text-indigo-400 bg-neutral-900 hover:bg-neutral-800 text-3xl">+</Button>

          <Button onClick={() => handleNumber('0')} className="col-span-2 rounded-2xl">0</Button>
          <Button onClick={() => handleNumber('.')}>.</Button>
          <Button onClick={calculate} className="bg-indigo-500 text-white hover:bg-indigo-600 rounded-2xl text-3xl">=</Button>
        </div>
      </div>
    </div>
  );
}
