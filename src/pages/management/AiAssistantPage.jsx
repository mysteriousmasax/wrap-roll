import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../api/client';
import { MessageCircle, Send, Sparkles } from 'lucide-react';

const quickQuestions = [
  'Give me the morning operations report and the first three actions to take.',
  'Which orders, payments, or kitchen tasks need attention right now?',
  'What inventory or staffing risks should I check before the next shift?',
];

export default function AiAssistantPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ask = async (nextQuestion = question) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || loading) return;
    setQuestion(trimmed);
    setLoading(true);
    setError('');
    try {
      const result = await api.askAiAssistant(trimmed);
      setAnswer(result.answer);
    } catch (requestError) {
      setError(requestError.message || 'Unable to reach the live assistant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Gemini Assistant" subtitle="Live operational help grounded in the current POS data" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-h-[28rem]">
          <div className="flex items-start gap-3 border-b border-outline-variant pb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white"><Sparkles size={18} /></div>
            <div><h2 className="font-display text-base font-bold">Ask about today&apos;s operation</h2><p className="mt-1 text-xs text-surface-on-variant">Gemini can review orders, payments, kitchen flow, inventory, staffing, and expenses. It can recommend actions but does not change records.</p></div>
          </div>
          {answer ? <div className="mt-5 whitespace-pre-wrap rounded-xl bg-surface-container-low p-4 text-sm leading-6 text-surface-on">{answer}</div> : <div className="mt-5 grid min-h-48 place-items-center rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-surface-on-variant"><div><MessageCircle className="mx-auto mb-2 text-primary" size={24} /><p>Ask a question or request the morning report.</p></div></div>}
          {error && <p className="mt-4 rounded-lg bg-error/10 p-3 text-sm text-error">{error}</p>}
          <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); ask(); }}>
            <input className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-white px-4 py-2.5 text-sm outline-none focus:border-primary" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask Gemini about the live operation" maxLength={1200} />
            <Button type="submit" size="sm" disabled={loading || !question.trim()}><Send size={14} /> {loading ? 'Thinking...' : 'Ask'}</Button>
          </form>
        </Card>
        <Card>
          <h3 className="font-display text-sm font-bold">Quick requests</h3>
          <div className="mt-3 grid gap-2">{quickQuestions.map((prompt) => <button type="button" key={prompt} onClick={() => ask(prompt)} disabled={loading} className="rounded-xl border border-outline-variant p-3 text-left text-xs leading-5 text-surface-on transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50">{prompt}</button>)}</div>
        </Card>
      </div>
    </div>
  );
}
