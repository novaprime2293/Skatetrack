import { useState } from 'react';
import { useStore } from '../data/store';
import { Button, TextInput, Label, Card } from '../components/ui';
import { DAY_NAMES } from '../data/types';

export function OnboardingPage({ onDone }: { onDone: () => void }) {
  const updateTeacherName = useStore((s) => s.updateTeacherName);
  const addBatch = useStore((s) => s.addBatch);
  const addStudent = useStore((s) => s.addStudent);
  const addMembership = useStore((s) => s.addMembership);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [batchName, setBatchName] = useState('');
  const [batchDays, setBatchDays] = useState<number[]>([]);
  const [batchStart, setBatchStart] = useState('16:00');
  const [batchEnd, setBatchEnd] = useState('17:00');
  const [batchLocation, setBatchLocation] = useState('');

  const handleStep1 = () => {
    if (name.trim()) {
      updateTeacherName(name.trim());
      setStep(2);
    }
  };

  const handleStep2 = () => {
    if (batchName.trim() && batchDays.length > 0) {
      const b = addBatch({
        name: batchName.trim(),
        daysOfWeek: batchDays,
        startTime: batchStart,
        endTime: batchEnd,
        location: batchLocation.trim() || undefined,
      });
      // seed 3 demo students
      const seed = [
        { name: 'Aarav Sharma', parentContact: undefined as string | undefined },
        { name: 'Diya Patel', parentContact: undefined as string | undefined },
        { name: 'Vihaan Kumar', parentContact: undefined as string | undefined },
      ];
      for (const s of seed) {
        const st = addStudent({
          name: s.name,
          parentContact: s.parentContact,
          dateJoined: new Date().toISOString().slice(0, 10),
        });
        addMembership(b.id, st.id);
      }
      setStep(3);
    }
  };

  const handleFinish = () => {
    onDone();
  };

  const skipEverything = () => {
    onDone();
  };

  return (
    <div className="min-h-screen bg-bg-base text-fg-primary flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="text-6xl mb-3">🛹</div>
            <h1 className="text-4xl font-extrabold tracking-tight neon-text-green">SKATETRACK</h1>
            <p className="text-fg-secondary mt-2">Track attendance. Stay on the board.</p>
          </div>

          {step === 1 && (
            <Card className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Welcome 👋</h2>
                <p className="text-sm text-fg-secondary">What should we call you?</p>
              </div>
              <div>
                <Label>Your name</Label>
                <TextInput
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Joseph"
                  onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
                />
              </div>
              <Button onClick={handleStep1} disabled={!name.trim()} className="w-full">
                Continue
              </Button>
              <button onClick={skipEverything} className="w-full text-xs text-fg-muted uppercase tracking-wider py-2 hover:text-fg-secondary">
                Skip setup for now
              </button>
            </Card>
          )}

          {step === 2 && (
            <Card className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Create your first batch</h2>
                <p className="text-sm text-fg-secondary">A batch is a recurring class group (e.g. Tuesday Beginners).</p>
              </div>
              <div>
                <Label>Batch name</Label>
                <TextInput autoFocus value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. Tuesday Beginners" />
              </div>
              <div>
                <Label>Days of the week</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAY_NAMES.map((d, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setBatchDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort()))
                      }
                      className={`aspect-square rounded-lg text-xs font-bold border transition-all ${
                        batchDays.includes(i)
                          ? 'bg-neon-green text-bg-base border-neon-green'
                          : 'bg-bg-card border-border text-fg-secondary hover:text-fg-primary'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start</Label>
                  <TextInput type="time" value={batchStart} onChange={(e) => setBatchStart(e.target.value)} />
                </div>
                <div>
                  <Label>End</Label>
                  <TextInput type="time" value={batchEnd} onChange={(e) => setBatchEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Location (optional)</Label>
                <TextInput value={batchLocation} onChange={(e) => setBatchLocation(e.target.value)} placeholder="e.g. Cubbon Park ramp" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button onClick={handleStep2} disabled={!batchName.trim() || batchDays.length === 0} className="flex-1">
                  Continue
                </Button>
              </div>
            </Card>
          )}

          {step === 3 && (
            <Card className="space-y-4 text-center">
              <div className="text-5xl">🎉</div>
              <div>
                <h2 className="text-xl font-bold mb-1">You're all set!</h2>
                <p className="text-sm text-fg-secondary">
                  We added 3 demo students to your first batch so you can try the swipe flow right now.
                </p>
              </div>
              <ul className="text-left text-sm space-y-2 pt-2">
                <li className="flex gap-2"><span className="text-neon-green">✓</span> Add more students in the <b className="text-fg-primary">Students</b> tab</li>
                <li className="flex gap-2"><span className="text-neon-green">✓</span> Add more batches in the <b className="text-fg-primary">Batches</b> tab</li>
                <li className="flex gap-2"><span className="text-neon-green">✓</span> See your stats in <b className="text-fg-primary">Home</b> & charts in <b className="text-fg-primary">Chart</b></li>
              </ul>
              <Button onClick={handleFinish} className="w-full">Start skating</Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
